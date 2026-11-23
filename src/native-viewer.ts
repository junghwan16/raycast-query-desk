import { environment, showToast, Toast } from "@raycast/api";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { QueryResult } from "./model";

export async function openResultWindow(result: QueryResult, title: string) {
  try {
    const executable = join(
      environment.assetsPath,
      "Omok Results.app",
      "Contents",
      "MacOS",
      "OmokTable",
    );
    const template = await readFile(
      join(environment.assetsPath, "omok-table.html"),
      "utf8",
    );
    const data = Buffer.from(JSON.stringify({ result, title })).toString(
      "base64",
    );
    const document = template.replace("<!-- OMOK_STATE -->", data);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [], {
        detached: true,
        stdio: ["pipe", "ignore", "ignore"],
      });
      child.once("error", reject);
      child.stdin.once("error", reject);
      child.stdin.end(document, () => {
        child.unref();
        resolve();
      });
    });
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not open the result window",
      message: "The Raycast preview is still available.",
    });
  }
}
