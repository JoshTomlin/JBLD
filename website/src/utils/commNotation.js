const COMMUTATOR_TOKENS = ["[", "]", ",", ":"];

export function hasCommNotation(algText = "") {
  const value = String(algText || "").trim();
  return COMMUTATOR_TOKENS.some((token) => value.includes(token));
}

export function normalizeNotationText(algText = "") {
  return String(algText || "")
    .replace(/\s+/g, " ")
    .replace(/\s*([[\],:])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitMove(move) {
  const token = String(move || "").trim();
  if (!token) {
    return null;
  }

  const match = token.match(/^(.*?)([2']*)$/);
  if (!match) {
    return { base: token, amount: 1 };
  }

  const [, base, suffix = ""] = match;
  if (!base) {
    return null;
  }

  if (suffix.includes("2")) {
    return { base, amount: 2 };
  }

  const apostropheCount = suffix.split("").filter((char) => char === "'").length;
  return { base, amount: apostropheCount % 2 === 1 ? 3 : 1 };
}

function amountToSuffix(amount) {
  const normalized = ((amount % 4) + 4) % 4;
  if (normalized === 0) {
    return null;
  }
  if (normalized === 1) {
    return "";
  }
  if (normalized === 2) {
    return "2";
  }
  return "'";
}

function invertMove(move) {
  const parts = splitMove(move);
  if (!parts) {
    return null;
  }

  const inverseSuffix = amountToSuffix(4 - parts.amount);
  return inverseSuffix === null ? "" : `${parts.base}${inverseSuffix}`;
}

function invertSequence(tokens) {
  return tokens
    .slice()
    .reverse()
    .map(invertMove)
    .filter(Boolean);
}

function simplifyTokens(tokens) {
  const output = [];

  tokens.forEach((token) => {
    const current = splitMove(token);
    if (!current) {
      return;
    }

    const previousToken = output[output.length - 1];
    const previous = splitMove(previousToken);

    if (!previous || previous.base !== current.base) {
      output.push(token);
      return;
    }

    output.pop();
    const combinedSuffix = amountToSuffix(previous.amount + current.amount);
    if (combinedSuffix !== null) {
      output.push(`${current.base}${combinedSuffix}`);
    }
  });

  return output;
}

function isStopChar(char) {
  return char === "]" || char === "," || char === ":";
}

function parseExpression(input, startIndex = 0) {
  const tokens = [];
  let index = startIndex;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "[") {
      const nested = parseBracketExpression(input, index);
      tokens.push(...nested.tokens);
      index = nested.nextIndex;
      continue;
    }

    if (isStopChar(char)) {
      break;
    }

    let endIndex = index;
    while (endIndex < input.length && !/\s/.test(input[endIndex]) && !COMMUTATOR_TOKENS.includes(input[endIndex])) {
      endIndex += 1;
    }

    tokens.push(input.slice(index, endIndex));
    index = endIndex;
  }

  return { tokens, nextIndex: index };
}

function parseBracketExpression(input, startIndex) {
  if (input[startIndex] !== "[") {
    throw new Error(`Expected "[" at index ${startIndex}`);
  }

  const left = parseExpression(input, startIndex + 1);
  const separator = input[left.nextIndex];
  if (separator !== "," && separator !== ":") {
    throw new Error(`Expected "," or ":" at index ${left.nextIndex}`);
  }

  const right = parseExpression(input, left.nextIndex + 1);
  if (input[right.nextIndex] !== "]") {
    throw new Error(`Expected "]" at index ${right.nextIndex}`);
  }

  const leftTokens = left.tokens;
  const rightTokens = right.tokens;
  const expanded =
    separator === ","
      ? [
          ...leftTokens,
          ...rightTokens,
          ...invertSequence(leftTokens),
          ...invertSequence(rightTokens),
        ]
      : [...leftTokens, ...rightTokens, ...invertSequence(leftTokens)];

  return {
    tokens: expanded,
    nextIndex: right.nextIndex + 1,
  };
}

export function expandCommNotation(algText = "", { simplify = true } = {}) {
  const normalized = normalizeNotationText(algText);
  if (!normalized) {
    return "";
  }

  const parsed = parseExpression(normalized, 0);
  const expandedTokens = parsed.tokens;
  const finalTokens = simplify ? simplifyTokens(expandedTokens) : expandedTokens;
  return finalTokens.join(" ");
}
