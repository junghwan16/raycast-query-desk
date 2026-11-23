import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import type { QueryResult } from "../src/model";

test("the result window sorts, filters, inspects, and copies selected rows", async (context) => {
  const sample: QueryResult = {
    columns: [
      { name: "id", kind: "number" },
      { name: "note", kind: "text" },
    ],
    rows: [
      ["2", "keep this"],
      ["19", "other"],
      ["300", "keep\n<한글>"],
    ],
    truncated: false,
  };
  const js = await build({
    entryPoints: ["viewer/table.ts"],
    bundle: true,
    format: "iife",
    write: false,
  });
  const template = await readFile("viewer/table.html", "utf8");
  const copied: Array<{ text: string; html?: string }> = [];
  const dom = new JSDOM(
    template.replace(
      "<!-- OMOK_STATE -->",
      Buffer.from(
        JSON.stringify({
          title: "Synthetic results",
          result: sample,
        }),
      ).toString("base64"),
    ),
    {
      runScripts: "outside-only",
      beforeParse(window) {
        Object.assign(window, {
          TextDecoder,
          webkit: {
            messageHandlers: {
              copy: {
                postMessage: (value: (typeof copied)[number]) =>
                  copied.push(value),
              },
            },
          },
        });
      },
    },
  );
  context.after(() => dom.window.close());
  dom.window.eval(js.outputFiles[0].text);
  const document = dom.window.document;

  function button(selector: string) {
    const entry = document.querySelector<HTMLButtonElement>(selector);
    assert.ok(entry);
    return entry;
  }

  function idsInOrder() {
    return [...document.querySelectorAll("#rows tr td:nth-child(2)")].map(
      (cell) => cell.textContent,
    );
  }

  const idHeader = button("#headers th:nth-child(2) button");
  idHeader.click();
  idHeader.click();
  assert.deepEqual(idsInOrder(), ["300", "19", "2"]);
  assert.equal(idHeader.parentElement?.getAttribute("aria-sort"), "descending");

  const search = document.querySelector<HTMLInputElement>("#find")!;
  search.value = "keep";
  search.dispatchEvent(new dom.window.Event("input"));
  assert.deepEqual(idsInOrder(), ["300", "2"]);

  const firstCell = document.querySelector<HTMLElement>(
    "#rows tr td:nth-child(3)",
  )!;
  firstCell.click();
  assert.equal(document.getElementById("value")?.textContent, "keep\n<한글>");
  button("#copy-value").click();
  assert.equal(copied.at(-1)?.text, "keep\n<한글>");

  document.querySelector<HTMLInputElement>("#headers input")!.click();
  button("#copy-markdown").click();
  assert.match(copied.at(-1)?.text ?? "", /\| 300 \|[^\n]+\n\| 2 \|/);
  assert.doesNotMatch(copied.at(-1)?.text ?? "", /other/);

  button("#copy-slack").click();
  assert.match(copied.at(-1)?.html ?? "", /&lt;&#54620;&#44544;&gt;/);
});
