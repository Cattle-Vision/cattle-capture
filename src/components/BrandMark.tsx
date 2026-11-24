"use client";

import React, { useId } from "react";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "h-9 w-9" }: BrandMarkProps) {
  const gradId = `cv-brand-${useId().replace(/:/g, "")}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#226B4F" />
          <stop offset="100%" stopColor="#133D2D" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${gradId})`} />
      <path
        d="M108 164 V120 Q108 104 124 104 H168"
        fill="none"
        stroke="#B7E4CE"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <path
        d="M344 104 H388 Q404 104 404 120 V164"
        fill="none"
        stroke="#B7E4CE"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <path
        d="M108 348 V392 Q108 408 124 408 H168"
        fill="none"
        stroke="#B7E4CE"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <path
        d="M344 408 H388 Q404 408 404 392 V348"
        fill="none"
        stroke="#B7E4CE"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <circle
        cx="256"
        cy="256"
        r="82"
        fill="#FFFFFF"
        fillOpacity="0.12"
        stroke="#FFFFFF"
        strokeWidth="20"
      />
      <circle cx="256" cy="256" r="32" fill="#FFFFFF" />
    </svg>
  );
}
