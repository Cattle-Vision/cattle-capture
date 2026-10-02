import * as ort from "onnxruntime-node";
import sharp from "sharp";
import path from "path";

// Initialize the ONNX session
let session: ort.InferenceSession | null = null;

export async function initModel() {
  if (session) return session;
  const modelPath = path.join(process.cwd(), "identifier.onnx");
  try {
    session = await ort.InferenceSession.create(modelPath);
    return session;
  } catch (err) {
    console.error("Falha ao carregar o modelo ONNX:", err);
    return null;
  }
}

export async function detectRearScore(imageBuffer: Buffer): Promise<number | null> {
  const sess = await initModel();
  if (!sess) return null;

  try {
    // 1. Preprocess: Resize to 640x640, remove alpha, format as float32 RGB
    const { data } = await sharp(imageBuffer)
      .resize(640, 640, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const float32Data = new Float32Array(3 * 640 * 640);

    // YOLO expects BCHW (1, 3, 640, 640) and values 0.0 - 1.0
    for (let i = 0; i < 640 * 640; i++) {
      float32Data[i] = data[i * 3] / 255.0; // R
      float32Data[640 * 640 + i] = data[i * 3 + 1] / 255.0; // G
      float32Data[2 * 640 * 640 + i] = data[i * 3 + 2] / 255.0; // B
    }

    const tensor = new ort.Tensor("float32", float32Data, [1, 3, 640, 640]);

    // 2. Inference
    const results = await sess.run({ images: tensor });
    const output = results[sess.outputNames[0]]; // Shape: [1, 5, 8400]
    
    // 3. Postprocess
    // output.data is a flattened Float32Array of 1 * 5 * 8400
    // [batch, row, col] -> The rows are: cx, cy, w, h, conf
    const outData = output.data as Float32Array;
    let maxConf = 0;

    for (let i = 0; i < 8400; i++) {
      const conf = outData[4 * 8400 + i]; // 5th row is confidence
      if (conf > maxConf) {
        maxConf = conf;
      }
    }

    // Return the score as a percentage (0 to 100)
    return Math.round(maxConf * 1000) / 10;
  } catch (err) {
    console.error("AI inference error:", err);
    return null;
  }
}
