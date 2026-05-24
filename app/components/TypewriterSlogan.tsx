"use client";

import { useState, useEffect } from "react";

const SLOGAN = "Seu estoque de moda, visualizado peça a peça.";
const SPEED_MS = 45;

export default function TypewriterSlogan() {
  const [displayed, setDisplayed] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= SLOGAN.length) return;
    const t = setTimeout(() => {
      setDisplayed((prev) => prev + SLOGAN[index]);
      setIndex((i) => i + 1);
    }, SPEED_MS);
    return () => clearTimeout(t);
  }, [index]);

  const done = index >= SLOGAN.length;

  return (
    <p className="mt-3 text-lg italic text-zinc-400">
      {displayed}
      <span
        className={`inline-block w-[2px] h-[1.1em] align-middle ml-0.5 bg-zinc-400 ${
          done ? "opacity-0" : "animate-pulse"
        } transition-opacity duration-300`}
      />
    </p>
  );
}
