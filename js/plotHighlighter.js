// js/plotHighlighter.js
import * as utils from './utils.js';
import * as config from './config.js';

export function getCharacterNameParts(fullName) {
    if (!fullName) {
        return {
            fullName: '',
            cleanedFullName: '',
            firstName: '',
            lastName: '',
            allUniqueParts: []
        };
    }
    const cleanedName = fullName.replace(/\s*\(.*?\)\s*$/, '').trim();
    const parts = cleanedName.split(/\s+/).filter(p => p.length > 0);
    let firstName = parts.length > 0 ? parts[0] : '';
    let lastName = parts.length > 1 ? parts[parts.length - 1] : '';

    let uniqueParts = new Set();
    if (cleanedName && cleanedName.length > 2) uniqueParts.add(cleanedName);
    if (firstName && firstName.length > 2) uniqueParts.add(firstName);
    if (lastName && lastName.length > 2 && lastName !== firstName) uniqueParts.add(lastName);
    if (fullName !== cleanedName && fullName.length > 2) uniqueParts.add(fullName);

    return {
        fullName: fullName,
        cleanedFullName: cleanedName,
        firstName: firstName,
        lastName: lastName,
        allUniqueParts: Array.from(uniqueParts).sort((a, b) => b.length - a.length) // Longest first
    };
}

function highlightAllNamePartsInText(rawTextSegment, namePartHighlightRegexes) {
    if (!rawTextSegment || !namePartHighlightRegexes || namePartHighlightRegexes.length === 0) {
        return utils.htmlEscape(rawTextSegment || '');
    }

    let matches = [];
    namePartHighlightRegexes.forEach(regex => {
        regex.lastIndex = 0; // Reset global regex state
        let match;
        while ((match = regex.exec(rawTextSegment)) !== null) {
            matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
        }
    });

    if (matches.length === 0) return utils.htmlEscape(rawTextSegment);

    // Sort matches: by start index, then by length (longer matches first for overlapping cases at same start)
    matches.sort((a, b) => a.start !== b.start ? a.start - b.start : (b.end - b.start) - (a.end - a.start));

    let nonOverlappingMatches = [];
    let lastMatchEnd = -1;
    for (const match of matches) {
        if (match.start >= lastMatchEnd) { // Prioritize longer matches by ensuring they are processed first
            nonOverlappingMatches.push(match);
            lastMatchEnd = match.end;
        }
        // If a shorter match starts at the same position or is contained, it will be skipped
        // if a longer match covering it was already added.
    }

    let resultHtml = "";
    let currentIndex = 0;
    nonOverlappingMatches.forEach(match => {
        if (match.start > currentIndex) {
            resultHtml += utils.htmlEscape(rawTextSegment.substring(currentIndex, match.start));
        }
        resultHtml += `<span class="highlighted-character">${utils.htmlEscape(match.text)}</span>`;
        currentIndex = match.end;
    });
    if (currentIndex < rawTextSegment.length) {
        resultHtml += utils.htmlEscape(rawTextSegment.substring(currentIndex));
    }
    return resultHtml;
}

function findStyledPassages(rawPlot, nameInfo) {
    const passages = [];
    if (!rawPlot || !nameInfo || nameInfo.allUniqueParts.length === 0) return passages;

    const nameHitRegions = [];
    nameInfo.allUniqueParts.forEach(part => { // Already sorted longest to shortest
        const regex = new RegExp(utils.escapeRegExp(part), 'gi');
        let match;
        while ((match = regex.exec(rawPlot)) !== null) {
            let isContained = nameHitRegions.some(region => match.index >= region.startIndex && (match.index + match[0].length) <= region.endIndex);
            if (!isContained) {
                for (let i = nameHitRegions.length - 1; i >= 0; i--) {
                    if (nameHitRegions[i].startIndex >= match.index && nameHitRegions[i].endIndex <= (match.index + match[0].length)) {
                        nameHitRegions.splice(i, 1);
                    }
                }
                nameHitRegions.push({ startIndex: match.index, endIndex: match.index + match[0].length });
            }
        }
    });

    nameHitRegions.sort((a, b) => a.startIndex - b.startIndex);

    const MAX_LOOKAROUND = config.PLOT_HIGHLIGHT_MAX_LOOKAROUND;

    nameHitRegions.forEach(hit => {
        let passageStart = hit.startIndex;
        let passageEnd = hit.endIndex;

        let PstartSearch = Math.max(0, hit.startIndex - MAX_LOOKAROUND);
        let searchSliceBefore = rawPlot.substring(PstartSearch, hit.startIndex);
        let lastTerminatorBefore = -1;
        const terminators = /(\.\s|[!?]\s|\n)/g;
        let termMatch;

        while((termMatch = terminators.exec(searchSliceBefore)) !== null) {
            lastTerminatorBefore = PstartSearch + termMatch.index + termMatch[0].length;
        }
        passageStart = (lastTerminatorBefore !== -1) ? lastTerminatorBefore : PstartSearch;
        if (passageStart === 0 && hit.startIndex > MAX_LOOKAROUND) { // If no terminator found and far from start
             passageStart = hit.startIndex - MAX_LOOKAROUND; // Ensure some context
        }


        let PendSearch = Math.min(rawPlot.length, hit.endIndex + MAX_LOOKAROUND);
        let searchSliceAfter = rawPlot.substring(hit.endIndex, PendSearch);
        terminators.lastIndex = 0;
        termMatch = terminators.exec(searchSliceAfter);

        if (termMatch !== null) {
            if (termMatch[0] === '\n') {
                 passageEnd = hit.endIndex + termMatch.index; // End before newline
            } else {
                 passageEnd = hit.endIndex + termMatch.index + 1; // Include the punctuation mark
            }
        } else {
            passageEnd = PendSearch; // End at search limit if no terminator
        }
        if (passageEnd === rawPlot.length && (rawPlot.length - hit.endIndex) > MAX_LOOKAROUND) {
            passageEnd = hit.endIndex + MAX_LOOKAROUND; // Ensure some context if no terminator and far from end
        }

        passages.push({ startIndex: passageStart, endIndex: passageEnd, type: 'match' });
    });

    if (passages.length === 0) return [];
    passages.sort((a, b) => a.startIndex - b.startIndex);

    const mergedPassages = [passages[0]];
    for (let i = 1; i < passages.length; i++) {
        const last = mergedPassages[mergedPassages.length - 1];
        const current = passages[i];
        if (current.startIndex < last.endIndex) { // Overlap or adjacent
            last.endIndex = Math.max(last.endIndex, current.endIndex);
            // Type 'match' should take precedence if merged
        } else {
            mergedPassages.push(current);
        }
    }
    return mergedPassages;
}


export function highlightCharacterInPlot(rawCurrentMoviePlot, characterName, formattedOriginalPlotHTML, displayFn) {
    if (!displayFn || typeof displayFn !== 'function') {
        console.error("displayFn is not provided or not a function in highlightCharacterInPlot");
        return;
    }

    if (!rawCurrentMoviePlot || !characterName) {
        displayFn(formattedOriginalPlotHTML, false);
        return;
    }

    const nameInfo = getCharacterNameParts(characterName);
    if (nameInfo.allUniqueParts.length === 0) {
        displayFn(formattedOriginalPlotHTML, false);
        return;
    }

    const styledPassages = findStyledPassages(rawCurrentMoviePlot, nameInfo);
    const namePartHighlightRegexes = nameInfo.allUniqueParts.map(term => new RegExp(utils.escapeRegExp(term), 'gi'));

    let finalHtmlSegments = [];
    let currentIndexInRawPlot = 0; // Tracks position in the full raw plot

    const plotLines = rawCurrentMoviePlot.split('\n');

    plotLines.forEach((line, lineIndex) => {
        if (lineIndex > 0) {
            finalHtmlSegments.push('<br>');
        }
        const currentLineGlobalStartIndex = currentIndexInRawPlot;
        const currentLineGlobalEndIndex = currentLineGlobalStartIndex + line.length;
        currentIndexInRawPlot += line.length + 1; // +1 for the newline character

        if (!line.trim()) { // Keep line breaks for empty lines in plot
            // finalHtmlSegments.push(''); // No, <br> is already added
            return;
        }

        let lineHtml = "";
        let currentLocalIndexInLine = 0; // Index within the current line

        const passagesInLine = styledPassages
            .filter(p => p.endIndex > currentLineGlobalStartIndex && p.startIndex < currentLineGlobalEndIndex)
            .map(p => ({
                startIndex: Math.max(0, p.startIndex - currentLineGlobalStartIndex),
                endIndex: Math.min(line.length, p.endIndex - currentLineGlobalStartIndex),
                type: p.type
            }))
            .sort((a, b) => a.startIndex - b.startIndex);

        if (passagesInLine.length === 0) {
            lineHtml = `<span class="sentence-faded">${highlightAllNamePartsInText(line, namePartHighlightRegexes)}</span>`;
        } else {
            passagesInLine.forEach(passage => {
                if (passage.startIndex > currentLocalIndexInLine) {
                    const segment = line.substring(currentLocalIndexInLine, passage.startIndex);
                    lineHtml += `<span class="sentence-faded">${highlightAllNamePartsInText(segment, namePartHighlightRegexes)}</span>`;
                }
                const passageText = line.substring(passage.startIndex, passage.endIndex);
                lineHtml += `<span class="sentence-highlight-${passage.type}">${highlightAllNamePartsInText(passageText, namePartHighlightRegexes)}</span>`;
                currentLocalIndexInLine = passage.endIndex;
            });
            if (currentLocalIndexInLine < line.length) {
                const segment = line.substring(currentLocalIndexInLine);
                lineHtml += `<span class="sentence-faded">${highlightAllNamePartsInText(segment, namePartHighlightRegexes)}</span>`;
            }
        }
        finalHtmlSegments.push(lineHtml);
    });

    displayFn(finalHtmlSegments.join(''), true);
}