// @ts-check
const { getThemePrefixedTokenClassName, concatConditionalThemes } = require('./utils');
const { getClassNamesFromMetadata } = require('../lib/vscode/modes');
const { declaration } = require('./renderers/css');

/**
 * @returns {NodeRegistry}
 */
function createNodeRegistry() {
  /** @type {Map<MDASTNode, RegisteredNodeData>} */
  const nodeMap = new Map();
  /** @type {ConditionalTheme[]} */
  let themes;
  /** @type {Map<string, { colorMap: string[], settings: Record<string, string> }>} */
  const themeColors = new Map();
  /** @type {Map<string, Map<string, string>>} */
  let themeTokenClassNameMap;
  /** @type {Map<MDASTNode, BinaryToken[][][]>} */
  let zippedLines;

  return {
    register: (node, data) => {
      nodeMap.set(node, data);
      themes = concatConditionalThemes(themes, data.possibleThemes);
      data.tokenizationResults.forEach(({ theme, colorMap, settings }) =>
        themeColors.set(theme.identifier, { colorMap, settings })
      );
    },
    mapLines: (node, mapper) => nodeMap.get(node).lines.map(mapper),
    mapTokens: (node, lineIndex, tokenMapper, plainLineMapper) => {
      generateClassNames();
      const { tokenizationResults, isTokenized, lines } = nodeMap.get(node);
      const line = lines[lineIndex];
      if (!isTokenized) {
        return [plainLineMapper(line.text)];
      }

      const zipped = zippedLines.get(node)[lineIndex];
      return zipped.map(tokens =>
        tokenMapper(
          line.text.slice(tokens[0].start, tokens[0].end),
          tokens.map(({ metadata }, i) => {
            const { theme } = tokenizationResults[i];
            const themeClassNames = themeTokenClassNameMap.get(theme.identifier);
            const canonicalClassNames = getClassNamesFromMetadata(metadata);
            return {
              value: canonicalClassNames.map(c => themeClassNames.get(c)),
              theme
            };
          })
        )
      );
    },
    forEachNode: nodeMap.forEach.bind(nodeMap),
    getAllPossibleThemes: () => themes.map(theme => ({ theme, settings: themeColors.get(theme.identifier).settings })),
    getTokenStylesForTheme: themeIdentifier => {
      /** @type {ReturnType<NodeRegistry['getTokenStylesForTheme']>} */
      const result = [];
      const colors = themeColors.get(themeIdentifier);
      const classNameMap = themeTokenClassNameMap.get(themeIdentifier);
      if (classNameMap) {
        classNameMap.forEach((className, canonicalClassName) => {
          if (canonicalClassName === 'mtkb') {
            result.unshift({ className, css: [declaration('font-weight', 'bold')] });
          } else if (canonicalClassName === 'mtki') {
            result.unshift({ className, css: [declaration('font-style', 'italic')] });
          } else if (canonicalClassName === 'mtku') {
            result.unshift({
              className,
              css: [declaration('text-decoration', 'underline'), declaration('text-underline-position', 'under')]
            });
          } else {
            result.push({
              className,
              css: [declaration('color', getColorFromColorMap(colors.colorMap, canonicalClassName))]
            });
          }
        });
      }

      return result;
    }
  };

  function generateClassNames() {
    if (themeTokenClassNameMap) return;
    themeTokenClassNameMap = new Map();
    zippedLines = new Map();
    nodeMap.forEach(({ lines, tokenizationResults, isTokenized }, node) => {
      if (!isTokenized) return;
      /** @type {BinaryToken[][][]} */
      const zippedLinesForNode = [];
      zippedLines.set(node, zippedLinesForNode);
      lines.forEach((_, lineIndex) => {
        const zipped = zipLineTokens(tokenizationResults.map(t => t.lines[lineIndex]));
        zippedLinesForNode[lineIndex] = zipped;
        zipped.forEach(tokensAtPosition => {
          tokensAtPosition.forEach((token, themeIndex) => {
            const canonicalClassNames = getClassNamesFromMetadata(token.metadata);
            const { theme } = tokenizationResults[themeIndex];
            let themeClassNames = themeTokenClassNameMap.get(theme.identifier);
            if (!themeClassNames) {
              themeClassNames = new Map();
              themeTokenClassNameMap.set(theme.identifier, themeClassNames);
            }
            canonicalClassNames.forEach(canonicalClassName => {
              themeClassNames.set(
                canonicalClassName,
                tokensAtPosition.length > 1
                  ? getThemePrefixedTokenClassName(canonicalClassName, theme.identifier)
                  : canonicalClassName
              );
            });
          });
        });
      });
    });
  }
}

/**
 * @param {BinaryToken[][]} lineTokenSets
 * @returns {BinaryToken[][]}
 * @example
 *
 * normalizeLineTokens([
 *   [{ start: 0, end: 10, metadata: X }],
 *   [{ start: 0, end:  5, metadata: Y }, { start: 5, end: 10, metadata: Z }]
 * ]);
 *
 * // Result:
 * [
 *   [{ start: 0, end:  5, metadata: X }, { start: 0, end:  5, metadata: Y }],
 *   [{ start: 5, end: 10, metadata: X }, { start: 5, end: 10, metadata: Z }]
 * ]
 */
function zipLineTokens(lineTokenSets) {
  lineTokenSets = lineTokenSets.map(lineTokens => lineTokens.slice());
  /** @type {BinaryToken[][]} */
  const result = [];
  let start = 0;
  while (true) {
    const end = Math.min(...lineTokenSets.map(lineTokens => (lineTokens[0] ? lineTokens[0].end : 0)));
    if (start >= end) break;

    /** @type {BinaryToken[]} */
    const tokensAtPosition = [];
    for (let i = 0; i < lineTokenSets.length; i++) {
      const token = lineTokenSets[i].shift();
      if (token.start === start && token.end === end) {
        tokensAtPosition.push(token);
      } else {
        tokensAtPosition.push({ start, end, metadata: token.metadata });
        lineTokenSets[i].unshift(token);
      }
    }
    result.push(tokensAtPosition);
    start = end;
  }

  return result;
}

/**
 * @param {string[]} colorMap
 * @param {string} canonicalClassName
 */
function getColorFromColorMap(colorMap, canonicalClassName) {
  const index = +canonicalClassName.slice('mtk'.length);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Canonical class name must be in form 'mtk{positive integer}'. Received '${canonicalClassName}'.`);
  }
  return colorMap[index];
}

module.exports = createNodeRegistry;