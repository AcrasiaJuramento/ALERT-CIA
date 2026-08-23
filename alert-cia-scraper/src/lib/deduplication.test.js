import assert from "node:assert/strict";
import test from "node:test";
import { extractStructuredAccidentDetails, inferAccidentSeverity } from "./deduplication.js";

test("classifies fatal scraped crash wording as black triage severity", () => {
  const text = "Isa ang nasawi at dalawa ang nasugatan matapos ang banggaan ng motorsiklo.";
  const details = extractStructuredAccidentDetails(text);

  assert.equal(inferAccidentSeverity(text, details), "black");
});

test("classifies high victim-count injuries as red triage severity", () => {
  const text = "Anim na pasahero ang sugatan matapos ang aksidente sa highway.";
  const details = extractStructuredAccidentDetails(text);

  assert.equal(inferAccidentSeverity(text, details), "red");
});
