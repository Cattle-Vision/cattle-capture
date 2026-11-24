/**
 * Módulo de Comunicação Web Bluetooth para Leitor RFID Bovino ESP32 (`src/lib/bluetooth-rfid.ts`).
 *
 * Arquitetura e compatibilidade com o firmware `finalesp`:
 * - Conecta-se ao GATT Server BLE `"CattleVision-RFID"` via Web Bluetooth API (`navigator.bluetooth`).
 * - Filtra por Service UUID (`4fafc201-1fb5-459e-8fcc-c5c9c331914b`) e prefixos de nome para garantir
 *   descoberta confiável mesmo quando o nome é entregue apenas no Scan Response.
 * - Escuta notificações assíncronas na característica `beb5483e-36e1-4688-b7f5-ea07361b26a8`
 *   com limpeza determinística de listeners para suportar reconexões em campo.
 * - Decodifica payloads ASCII hexadecimais de 24 caracteres (12 bytes EPC, MTU >= 64 no ESP32),
 *   descarta ruído/UID zerado e aplica debounce local de 2.5s.
 */

export const RFID_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const RFID_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

export type BluetoothStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface RfidEventDetail {
  tag: string;
  timestamp: number;
  source: "ble" | "manual" | "simulation";
}

type TagListener = (detail: RfidEventDetail) => void;
type StatusListener = (status: BluetoothStatus, deviceName?: string, errorMsg?: string) => void;

class BluetoothRfidService {
  private device: any = null;
  private characteristic: any = null;
  private status: BluetoothStatus = "disconnected";
  private deviceName = "";
  private lastTag = "";
  private lastTagTime = 0;
  private tagListeners: Set<TagListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private connectPromise: Promise<boolean> | null = null;

  private readonly onCharacteristicChangedBound = (event: any) =>
    this.handleCharacteristicValue(event);

  private readonly onGattDisconnectedBound = () => {
    this.detachCharacteristic();
    this.deviceName = "";
    this.setStatus("disconnected");
    this.playAudioFeedback("disconnect");
  };

  constructor() {
    if (typeof window !== "undefined" && !("bluetooth" in navigator)) {
      this.status = "unsupported";
    }
  }

  /**
   * Verifica se o navegador atual suporta a Web Bluetooth API.
   */
  public isSupported(): boolean {
    return typeof window !== "undefined" && "bluetooth" in navigator;
  }

  public getStatus(): BluetoothStatus {
    return this.status;
  }

  public getDeviceName(): string {
    return this.deviceName;
  }

  /**
   * Registra listener para novas leituras de RFID.
   */
  public onTag(listener: TagListener): () => void {
    this.tagListeners.add(listener);
    return () => this.tagListeners.delete(listener);
  }

  /**
   * Registra listener para alterações de status de conexão Bluetooth.
   */
  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status, this.deviceName);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: BluetoothStatus, errorMsg?: string) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status, this.deviceName, errorMsg));
  }

  private detachCharacteristic() {
    if (this.characteristic) {
      try {
        this.characteristic.removeEventListener(
          "characteristicvaluechanged",
          this.onCharacteristicChangedBound
        );
      } catch {
        // Ignora se o GATT já foi encerrado
      }
      this.characteristic = null;
    }
  }

  private detachDevice(disconnectGatt = false) {
    this.detachCharacteristic();
    if (this.device) {
      try {
        this.device.removeEventListener("gattserverdisconnected", this.onGattDisconnectedBound);
      } catch {
        // Ignora erro ao remover listener
      }
      if (disconnectGatt && this.device.gatt?.connected) {
        try {
          this.device.gatt.disconnect();
        } catch {
          // Ignora erro ao desconectar GATT
        }
      }
      this.device = null;
    }
  }

  /**
   * Emite feedback sonoro sintético no alto-falante do celular/computador.
   */
  public playAudioFeedback(type: "read" | "success" | "alert" | "disconnect") {
    try {
      if (typeof window === "undefined") return;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume();
      }

      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === "read") {
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === "success") {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "alert") {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(330, now + 0.25);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === "disconnect") {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {
      // Ignora silenciosamente se o navegador bloquear autoplay de áudio
    }
  }

  /**
   * Vibração tátil no celular do operador.
   */
  public triggerHaptic(pattern: number[] = [100]) {
    try {
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Sem suporte à vibração
    }
  }

  /**
   * Inicia o pareamento com o dispositivo ESP32 via Web Bluetooth.
   * IMPORTANTE: Deve ser chamado diretamente em resposta a um gesto do usuário.
   */
  public async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      this.setStatus("unsupported", "Web Bluetooth não é suportado neste navegador.");
      return false;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.performConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async performConnect(): Promise<boolean> {
    try {
      // Garante encerramento limpo de qualquer sessão anterior antes de abrir nova janela BLE
      this.detachDevice(true);
      this.deviceName = "";
      this.setStatus("connecting");

      // Inclui tanto filtro pelo Service UUID anunciado no pacote primário quanto prefixos de nome
      // (necessário no ESP32 porque o Device Name pode trafegar apenas no Scan Response).
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [RFID_SERVICE_UUID] },
          { namePrefix: "CattleVision" },
          { namePrefix: "ESP32" },
          { namePrefix: "RFID" },
        ],
        optionalServices: [RFID_SERVICE_UUID],
      });

      this.device = device;
      this.deviceName = device.name || "CattleVision-RFID";
      device.addEventListener("gattserverdisconnected", this.onGattDisconnectedBound);

      const characteristic = await this.subscribeGattCharacteristic(device);
      this.characteristic = characteristic;

      this.setStatus("connected");
      this.playAudioFeedback("success");
      this.triggerHaptic([80, 50, 80]);

      return true;
    } catch (err: any) {
      console.warn("[BluetoothRfid] Falha na conexão:", err);
      this.detachDevice(true);
      this.deviceName = "";
      if (err?.name === "NotFoundError" || err?.message?.includes("User cancelled")) {
        this.setStatus("disconnected");
      } else {
        this.setStatus("error", err?.message || "Erro ao conectar ao leitor RFID.");
      }
      return false;
    }
  }

  /**
   * Conecta ao servidor GATT e ativa notificações com uma tentativa de recuperação
   * caso a descoberta de serviços do stack BLE do celular ainda esteja estabilizando.
   */
  private async subscribeGattCharacteristic(device: any): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(RFID_SERVICE_UUID);
        const characteristic = await service.getCharacteristic(RFID_CHARACTERISTIC_UUID);
        await characteristic.startNotifications();
        characteristic.addEventListener(
          "characteristicvaluechanged",
          this.onCharacteristicChangedBound
        );
        return characteristic;
      } catch (err) {
        lastError = err;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }
    throw lastError;
  }

  /**
   * Desconecta manualmente do dispositivo ESP32.
   */
  public disconnect(): void {
    this.detachDevice(true);
    this.deviceName = "";
    this.setStatus("disconnected");
  }

  /**
   * Processa o payload binário emitido pelo ESP32 via notificação BLE.
   */
  private handleCharacteristicValue(event: any) {
    const value: DataView = event?.target?.value;
    if (!value || value.byteLength === 0) return;

    const decoder = new TextDecoder("utf-8");
    const rawString = decoder.decode(value);
    const cleanTag = rawString.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    // Ignora ruído curto ou UID totalmente zerado enviado por leitura incompleta
    if (cleanTag.length < 2 || /^0+$/.test(cleanTag)) return;

    // Debounce local: evita disparos repetidos em janela inferior a 2.5s
    const now = Date.now();
    if (cleanTag === this.lastTag && now - this.lastTagTime < 2500) {
      return;
    }

    this.lastTag = cleanTag;
    this.lastTagTime = now;

    this.playAudioFeedback("read");
    this.triggerHaptic([100]);

    this.dispatchTagEvent({
      tag: cleanTag,
      timestamp: now,
      source: "ble",
    });
  }

  /**
   * Emite manualmente uma leitura de tag (usado pelo Simulador / Leitura Manual).
   */
  public emitManualTag(tag: string, source: "manual" | "simulation" = "manual") {
    const cleanTag = tag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim();
    if (cleanTag.length < 2 || /^0+$/.test(cleanTag)) return;

    const now = Date.now();
    this.lastTag = cleanTag;
    this.lastTagTime = now;

    this.playAudioFeedback("read");
    this.triggerHaptic([80]);

    this.dispatchTagEvent({
      tag: cleanTag,
      timestamp: now,
      source,
    });
  }

  private dispatchTagEvent(detail: RfidEventDetail) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cattlevision:rfid-read", { detail }));
    }

    this.tagListeners.forEach((listener) => {
      try {
        listener(detail);
      } catch (err) {
        console.error("[BluetoothRfid] Erro no listener:", err);
      }
    });
  }
}

export const bluetoothRfid = new BluetoothRfidService();
