const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, wer, numberToWords } = require("../src/wer");

test("formatting differences that are not recognition errors normalise away", () => {
  const reference = normalize("MISTER QUILTER'S MANNER IS TWENTY FIVE TIMES LESS INTERESTING");
  const hypothesis = normalize("Mr. Quilter’s manner is 25 times less—interesting!");
  assert.equal(hypothesis, reference);
  assert.equal(wer(reference, hypothesis).wer, 0);
});

test("normalize handles the forms providers actually emit", () => {
  assert.equal(normalize("Dr. Smith & co., 2nd floor"), "doctor smith and co second floor");
  assert.equal(normalize("It cost $3.50, about 12% more"), "it cost three point five zero dollars about twelve percent more");
  assert.equal(normalize("Up guards and at 'em"), "up guards and at em");
  assert.equal(normalize("Um, so, uh, yes"), "so yes");
  assert.equal(normalize("In the 1990s, 1,000 people"), "in the nineteen nineties one thousand people");
  assert.equal(normalize(""), "");
});

test("numbers read the way people say them", () => {
  assert.equal(numberToWords("0"), "zero");
  assert.equal(numberToWords("117"), "one hundred seventeen");
  assert.equal(numberToWords("1905"), "nineteen oh five");
  assert.equal(numberToWords("2005"), "two thousand five");
  assert.equal(numberToWords("2024"), "twenty twenty four");
  assert.equal(numberToWords("1900"), "nineteen hundred");
  assert.equal(numberToWords("5000"), "five thousand");
  assert.equal(numberToWords("1234567"), "one million two hundred thirty four thousand five hundred sixty seven");
  assert.equal(numberToWords("21st"), "twenty first");
  assert.equal(numberToWords("40th"), "fortieth");
});

test("wer counts substitutions, deletions and insertions", () => {
  // Chosen so there is only one minimal alignment.
  const r = wer("the cat sat on the mat", "well the bat sat on mat");
  assert.equal(r.substitutions, 1);
  assert.equal(r.deletions, 1);
  assert.equal(r.insertions, 1);
  assert.equal(r.hits, 4);
  assert.equal(r.referenceWords, 6);
  assert.equal(r.wer, 3 / 6);
  assert.deepEqual(
    r.alignment.filter((a) => a.op !== "="),
    [
      { op: "I", ref: null, hyp: "well" },
      { op: "S", ref: "cat", hyp: "bat" },
      { op: "D", ref: "the", hyp: null },
    ]
  );
});

test("wer edge cases", () => {
  assert.equal(wer("a b c", "").wer, 1);
  assert.equal(wer("a b c", "").deletions, 3);
  assert.equal(wer("", "").wer, 0);
  assert.equal(wer("", "x").wer, 1);
  // WER is not capped at 100%: inserting more words than the reference has is possible.
  assert.equal(wer("a", "x y z").wer, 3);
});
