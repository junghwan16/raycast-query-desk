import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

if (process.platform !== "darwin") {
  throw new Error("Building Omok's result window requires macOS.");
}

const bundle = "assets/Omok Results.app/Contents";
await mkdir(`${bundle}/MacOS`, { recursive: true });
await copyFile("viewer/Info.plist", `${bundle}/Info.plist`);
execFileSync(
  "xcrun",
  [
    "swiftc",
    "-parse-as-library",
    "-O",
    "viewer/OmokTable.swift",
    "-o",
    `${bundle}/MacOS/OmokTable`,
  ],
  { stdio: "inherit" },
);

const [template, styles, script] = await Promise.all([
  readFile("viewer/table.html", "utf8"),
  readFile("viewer/table.css", "utf8"),
  build({
    entryPoints: ["viewer/table.ts"],
    bundle: true,
    format: "iife",
    target: "safari17",
    write: false,
  }),
]);

await writeFile(
  "assets/omok-table.html",
  template
    .replace("/* CSS */", () => styles)
    .replace("/* SCRIPT */", () =>
      script.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"),
    ),
);
