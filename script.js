// --- Global variables ---
let allMoviesDataFromYaml = [];
let characterNameToGlobalIdMap = {};
let globallyUniqueNodesMasterList = [];
let globallyUniqueEdgesMasterList = [];

let network = null;
let allNodesDataSet = new vis.DataSet();
let allEdgesDataSet = new vis.DataSet();

const minNodeSize = 10; const maxNodeSize = 90;
const baseSizePerConnection = 10;

const minNodeLabelSize = 20; const maxNodeLabelSize = 44;
const nodeLabelDegreeScaleFactor = 5;
const minEdgeLabelSize = 18; const maxEdgeLabelSize = 38;
const edgeLabelStrengthScaleFactor = 2.5;

const SENTIMENT_COLORS_HEX = ["#2ca02c", "#d62728", "#ff7f0e", "#7f7f7f"];
let generatedGroupColorsCache = {};
let lastHue = Math.random() * 360;
const HUE_INCREMENT = 137.508;
const FIXED_GROUP_SATURATION = 50;
const FIXED_GROUP_LIGHTNESS = 30;

const sentimentColors = { positive: SENTIMENT_COLORS_HEX[0], negative: SENTIMENT_COLORS_HEX[1], complicated: SENTIMENT_COLORS_HEX[2], neutral: SENTIMENT_COLORS_HEX[3] };
const defaultNodeBorderColor = '#3b4048';
const nodeHighlightBorderColor = '#61afef';
const nodeHighlightBorderWidth = 3; const nodeDefaultBorderWidth = 2;
const baseNodeFontSizeForReset = 24; const baseEdgeFontSizeForReset = 21;

const IMAGE_BASE_PATH = 'output/character_images/';
const COMMON_IMAGE_EXTENSIONS = ['.jpg', '.png', '.jpeg', '.webp'];

let physicsStopTimeout;
let formattedOriginalPlotHTML = '<p class="info-placeholder">Plot summary will appear here once a movie is selected.</p>';
let rawCurrentMoviePlot = '';

// --- Helper Functions ---
function htmlEscape(str) {
    if (!str) return '';
   return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getTextColorForBackground(hexColor) {
    if (!hexColor) return '#e0e0e0';
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return brightness > 127.5 ? '#000000' : '#FFFFFF';
}

function createTooltipElement(text, backgroundColor) {
    const tooltipContent = document.createElement('div');
    const textColor = getTextColorForBackground(backgroundColor);
    tooltipContent.style.backgroundColor = backgroundColor || '#2c313a';
    tooltipContent.style.color = textColor;
    tooltipContent.style.padding = '10px';
    tooltipContent.style.borderRadius = '8px';
    tooltipContent.style.whiteSpace = 'pre-wrap';
    tooltipContent.innerText = text || '';
    return tooltipContent;
}

function getEdgeWidth(strength) {
    if (strength === 5) return 25; if (strength === 4) return 15;
    if (strength === 3) return 6;  if (strength === 2) return 2;
    return 1;
}

function calculateNodeFontSize(degree) {
    return Math.min(minNodeLabelSize + (degree * nodeLabelDegreeScaleFactor), maxNodeLabelSize);
}

function calculateEdgeFontSize(strength) {
    return Math.min(minEdgeLabelSize + ((strength - 1) * edgeLabelStrengthScaleFactor), maxEdgeLabelSize);
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function generateAndCacheGroupColor(groupName) {
    if (generatedGroupColorsCache[groupName]) return generatedGroupColorsCache[groupName];
    if (groupName === 'Unknown') return generatedGroupColorsCache[groupName] = '#bdbdbd';
    let newColorHex, attempts = 0;
    do {
        lastHue = (lastHue + HUE_INCREMENT) % 360;
        newColorHex = hslToHex(lastHue, FIXED_GROUP_SATURATION, FIXED_GROUP_LIGHTNESS);
        attempts++;
    } while (SENTIMENT_COLORS_HEX.includes(newColorHex.toLowerCase()) && attempts < 20);
    if (attempts >= 20) console.warn(`Could not generate distinct color for ${groupName}`);
    return generatedGroupColorsCache[groupName] = newColorHex;
}

function slugify(text) {
    if (!text) return "unknown";
    return String(text).toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || "slug_error";
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Data Processing & Network Setup --- (Mostly unchanged, ensure calls to new highlight logic are correct)
function processAllDataFromYaml() {
    let globalNodeIdCounter = 0;
    characterNameToGlobalIdMap = {};
    globallyUniqueNodesMasterList = [];
    globallyUniqueEdgesMasterList = [];

    allMoviesDataFromYaml.forEach(movie => {
        const movieTitle = movie.movie_title;
        if (movie.character_list) {
            movie.character_list.forEach(character => {
                const globalId = globalNodeIdCounter++;
                const characterKey = `${movieTitle}_${character.name}`;
                characterNameToGlobalIdMap[characterKey] = globalId;
                globallyUniqueNodesMasterList.push({
                    id: globalId, label: character.name, actor_name: character.actor_name || 'Unknown Actor',
                    rawGroup: character.group || 'Unknown',
                    tooltipTextData: `${character.name || 'Unknown Character'}\n(Played by: ${character.actor_name || 'Unknown Actor'})\n\n${character.description || 'No description available.'}`,
                    movieTitle: movieTitle, tmdb_person_id: character.tmdb_person_id || null
                });
            });
        }
    });

    allMoviesDataFromYaml.forEach(movie => {
        const movieTitle = movie.movie_title;
        if (movie.relationships) {
            movie.relationships.forEach(rel => {
                const fromKey = `${movieTitle}_${rel.source}`;
                const toKey = `${movieTitle}_${rel.target}`;
                const fromId = characterNameToGlobalIdMap[fromKey];
                const toId = characterNameToGlobalIdMap[toKey];
                if (fromId !== undefined && toId !== undefined) {
                    globallyUniqueEdgesMasterList.push({
                        from: fromId, to: toId, rawLabel: rel.type || "", rawStrength: rel.strength || 1,
                        tooltipTextData: `${rel.type || 'Relationship'}: ${rel.source} & ${rel.target}\n\n${rel.description || 'No specific details.'}`,
                        rawBaseColor: sentimentColors[rel.sentiment] || sentimentColors.neutral,
                        rawArrows: { to: { enabled: false } }, rawSentiment: rel.sentiment || 'neutral', movieTitle: movieTitle,
                    });
                } else { console.warn(`Could not map edge for movie "${movieTitle}": ${rel.source} -> ${rel.target}.`); }
            });
        }
    });
}

function populateMovieSelector() {
    const selector = document.getElementById('movieSelector');
    selector.innerHTML = '';
    const movieTitles = [...new Set(allMoviesDataFromYaml.map(m => m.movie_title))].sort();
    if (movieTitles.length > 0) {
        movieTitles.forEach(title => {
            const option = document.createElement('option');
            option.value = title; option.textContent = title; selector.appendChild(option);
        });
        selector.value = movieTitles[0];
    } else {
        const option = document.createElement('option');
        option.textContent = "No movies available"; option.disabled = true; selector.appendChild(option);
    }
    selector.addEventListener('change', (event) => updateNetworkForMovie(event.target.value));
}

function generateHelperEdges(nodesForClustering) { /* ... (same as before) ... */
    const helperEdges = []; const groups = {};
    nodesForClustering.forEach(node => {
        if (!groups[node.group]) groups[node.group] = [];
        groups[node.group].push(node.id);
    });
    for (const groupName in groups) {
        const nodeIdsInGroup = groups[groupName];
        if (nodeIdsInGroup.length > 1) {
        for (let i = 0; i < nodeIdsInGroup.length; i++) {
            for (let j = i + 1; j < nodeIdsInGroup.length; j++) {
            helperEdges.push({ from: nodeIdsInGroup[i], to: nodeIdsInGroup[j], hidden: true, color: {opacity: 0.1}});
            }
        }
        }
    }
    return helperEdges;
}

function updateLegend() { /* ... (same as before, ensure it doesn't rely on old highlighting state) ... */
    const legendContainer = document.getElementById('legend');
    if (!legendContainer) return;
    legendContainer.innerHTML = '';
    const groupsTitle = document.createElement('h3');
    groupsTitle.textContent = 'Character Groups'; legendContainer.appendChild(groupsTitle);
    const currentGroupsInView = new Set();
    if (allNodesDataSet) allNodesDataSet.forEach(node => currentGroupsInView.add(node.group));
    if (currentGroupsInView.size === 0 && allNodesDataSet.length === 0) {
        const placeholder = document.createElement('p'); placeholder.className = 'info-placeholder';
        placeholder.textContent = 'No character groups to display.'; legendContainer.appendChild(placeholder);
    } else {
        Object.keys(generatedGroupColorsCache).filter(gName => currentGroupsInView.has(gName)).sort().forEach(gName => {
            const color = generatedGroupColorsCache[gName]; const item = document.createElement('div'); item.className = 'legend-item';
            const box = document.createElement('div'); box.className = 'legend-color-box'; box.style.backgroundColor = color;
            const text = document.createElement('span'); text.className = 'legend-text'; text.textContent = gName;
            item.appendChild(box); item.appendChild(text); legendContainer.appendChild(item);
        });
    }
    const sentimentsTitle = document.createElement('h3'); sentimentsTitle.style.marginTop = '15px';
    sentimentsTitle.textContent = 'Relationship Sentiments'; legendContainer.appendChild(sentimentsTitle);
    const sentimentOrder = ['positive', 'negative', 'complicated', 'neutral']; const currentSentimentsInView = new Set();
    if (allEdgesDataSet) allEdgesDataSet.get({ filter: e => !e.hidden }).forEach(e => { if (e.sentiment) currentSentimentsInView.add(e.sentiment); });
    if (currentSentimentsInView.size === 0 && allEdgesDataSet.get({ filter: e => !e.hidden }).length === 0) {
        const placeholder = document.createElement('p'); placeholder.className = 'info-placeholder';
        placeholder.textContent = 'No sentiments to display.'; legendContainer.appendChild(placeholder);
    } else {
        const sortedSentimentKeys = sentimentOrder.filter(k => sentimentColors.hasOwnProperty(k) && currentSentimentsInView.has(k));
        currentSentimentsInView.forEach(sName => { if (!sortedSentimentKeys.includes(sName) && sentimentColors.hasOwnProperty(sName)) sortedSentimentKeys.push(sName); });
        sortedSentimentKeys.forEach(sName => {
            const color = sentimentColors[sName]; const item = document.createElement('div'); item.className = 'legend-item';
            const box = document.createElement('div'); box.className = 'legend-color-box'; box.style.backgroundColor = color;
            const text = document.createElement('span'); text.className = 'legend-text'; text.textContent = sName.charAt(0).toUpperCase() + sName.slice(1);
            item.appendChild(box); item.appendChild(text); legendContainer.appendChild(item);
        });
    }
}
function updateHoverInfoPanel(itemData, type) { /* ... (same as before) ... */
    const panel = document.getElementById('hoverInfoPanel'); if (!panel) return; panel.innerHTML = '';
    if (!itemData) { panel.innerHTML = '<p class="info-placeholder">Hover over an item for details.</p>'; return; }
    const titleElement = document.createElement('h3'); let description = '';
    if (itemData.rawTooltipData) {
        const parts = itemData.rawTooltipData.split('\n\n'); if (parts.length > 1) {
            description = parts.slice(1).join('\n\n').trim();
            if (description.startsWith("(Played by:")) {
                const firstNewLineIndex = description.indexOf('\n');
                description = (firstNewLineIndex !== -1) ? description.substring(firstNewLineIndex + 1).trim() : '';
            }
        }
        if (description === 'No description available.' || description === 'No specific details.') description = '';
    }
    if (type === 'node' && itemData) {
        titleElement.textContent = 'Character Details'; panel.appendChild(titleElement);
        addInfoItem(panel, 'Name:', itemData.label); addInfoItem(panel, 'Actor:', itemData.actor_name);
        // Image panel logic (remains the same)
        if (itemData.tmdb_person_id || itemData.label) {
            const imagePanelDiv = document.createElement('div'); imagePanelDiv.className = 'info-images-container';
            imagePanelDiv.style.cssText = 'display: flex; justify-content: space-around; align-items: center; gap: 10px; margin-top: 10px; margin-bottom: 10px;';
            const actorImg = document.createElement('img'); actorImg.alt = `Actor: ${itemData.actor_name || 'N/A'}`; actorImg.className = 'info-panel-image';
            actorImg.style.cssText = 'max-width: 80px; max-height: 120px; display: none;';
            const charImg = document.createElement('img'); charImg.alt = `Character: ${itemData.label || 'N/A'}`; charImg.className = 'info-panel-image';
            charImg.style.cssText = 'max-width: 80px; max-height: 120px; display: none;';
            imagePanelDiv.appendChild(actorImg); imagePanelDiv.appendChild(charImg);
            let actorLoaded = false, charLoaded = false;
            const tryLoad = (imgEl, prefix, exts, cb) => { let i=0; const attempt = () => { if(i<exts.length) {imgEl.src=`${IMAGE_BASE_PATH}${prefix}${exts[i]}`; imgEl.onload=()=>{imgEl.style.display='block';cb(true);}; imgEl.onerror=()=>{i++; attempt();};} else {imgEl.style.display='none';cb(false);}}; attempt();};
            const updateVisibility = () => {imagePanelDiv.style.display = (actorLoaded || charLoaded) ? 'flex' : 'none';};
            let actorAttemptDone = !itemData.tmdb_person_id, charAttemptDone = !itemData.label;
            if(itemData.tmdb_person_id) tryLoad(actorImg, itemData.tmdb_person_id, COMMON_IMAGE_EXTENSIONS, s=>{actorLoaded=s; actorAttemptDone=true; if(charAttemptDone) updateVisibility();});
            if(itemData.label) { let charFile = itemData.tmdb_person_id ? `${itemData.tmdb_person_id}_char_${slugify(itemData.label)}_1` : `${slugify(itemData.label)}_char_unknown_id_1`; tryLoad(charImg, charFile, COMMON_IMAGE_EXTENSIONS, s=>{charLoaded=s; charAttemptDone=true; if(actorAttemptDone) updateVisibility();});}
            panel.appendChild(imagePanelDiv); if(!actorAttemptDone || !charAttemptDone) imagePanelDiv.style.display='none'; else updateVisibility();
        }
        addInfoItem(panel, 'Group:', itemData.group); if (description) addInfoItem(panel, 'Description:', description, true);
    } else if (type === 'edge' && itemData) {
        titleElement.textContent = 'Relationship Details'; panel.appendChild(titleElement);
        const fromNode = allNodesDataSet.get(itemData.from); const toNode = allNodesDataSet.get(itemData.to);
        addInfoItem(panel, 'Type:', itemData.label || "N/A"); addInfoItem(panel, 'From:', fromNode ? fromNode.label : `ID: ${itemData.from}`);
        addInfoItem(panel, 'To:', toNode ? toNode.label : `ID: ${itemData.to}`);
        addInfoItem(panel, 'Sentiment:', itemData.sentiment ? (itemData.sentiment.charAt(0).toUpperCase() + itemData.sentiment.slice(1)) : "N/A");
        if (description) addInfoItem(panel, 'Description:', description, true);
        // Relationship Image logic (remains the same)
        if (fromNode && fromNode.label && toNode && toNode.label) {
            const relImagePanelDiv = document.createElement('div'); relImagePanelDiv.style.cssText = 'margin-top: 10px; display: none;';
            const relImg = document.createElement('img'); relImg.alt = `Visual: ${fromNode.label} & ${toNode.label}`; relImg.className = 'info-panel-image';
            relImg.style.cssText = 'max-width: 90%; max-height: 150px; display: none; margin: 0 auto;';
            relImagePanelDiv.appendChild(relImg); panel.appendChild(relImagePanelDiv);
            const slugSrc = slugify(fromNode.label), slugTgt = slugify(toNode.label);
            const p1 = `rel_${slugSrc}_${slugTgt}_1`, p2 = `rel_${slugTgt}_${slugSrc}_1`;
            const tryLoad = (imgEl, prefix, exts, cb) => { let i=0; const attempt = () => { if(i<exts.length) {imgEl.src=`${IMAGE_BASE_PATH}${prefix}${exts[i]}`; imgEl.onload=()=>{imgEl.style.display='block';cb(true);}; imgEl.onerror=()=>{i++; attempt();};} else {imgEl.style.display='none';cb(false);}}; attempt();};
            tryLoad(relImg, p1, COMMON_IMAGE_EXTENSIONS, s1=>{if(s1)relImagePanelDiv.style.display='block'; else tryLoad(relImg,p2,COMMON_IMAGE_EXTENSIONS,s2=>{if(s2)relImagePanelDiv.style.display='block';});});
        }
    } else { panel.innerHTML = '<p class="info-placeholder">Hover over an item for details.</p>'; }
}
function addInfoItem(panel, key, value, isBlockValue = false) { /* ... (same as before) ... */
    if (value === undefined || value === null || value === '') return;
    const itemDiv = document.createElement('div'); itemDiv.className = 'info-item';
    const keySpan = document.createElement('span'); keySpan.className = 'info-key'; keySpan.textContent = key;
    const valueSpan = document.createElement('span'); valueSpan.className = 'info-value';
    if (isBlockValue) valueSpan.style.whiteSpace = 'pre-wrap'; valueSpan.textContent = value;
    itemDiv.appendChild(keySpan); itemDiv.appendChild(valueSpan); panel.appendChild(itemDiv);
}

function displayPlotInPanel(htmlContentForPlotArea, isHighlightingActive = false) { // isHighlightingActive for potential animation hooks
    const plotPanel = document.getElementById('plotSummaryPanel'); if (!plotPanel) return;
    let titleElement = plotPanel.querySelector('h3.plot-title');
    if (!titleElement) {
        titleElement = document.createElement('h3'); titleElement.className = 'plot-title'; titleElement.textContent = 'Plot Summary';
        titleElement.style.cssText = 'margin-top:0; margin-bottom:10px; font-size:1.1em; color:#dedede; border-bottom:1px solid #434343; padding-bottom:5px;';
        plotPanel.insertBefore(titleElement, plotPanel.firstChild);
    }
    let contentDiv = plotPanel.querySelector('.plot-content-area');
    if (!contentDiv) { contentDiv = document.createElement('div'); contentDiv.className = 'plot-content-area'; plotPanel.appendChild(contentDiv); }
    contentDiv.innerHTML = htmlContentForPlotArea;

    // Animation hook (if re-enabled, ensure CSS classes define transitions)
    // if (isHighlightingActive) {
    //     requestAnimationFrame(() => {
    //         const elementsToAnimate = contentDiv.querySelectorAll('.sentence-faded, .sentence-highlight-match, .sentence-highlight-context');
    //         elementsToAnimate.forEach(el => el.classList.add('applied')); // Assuming CSS handles transition from base to .applied
    //     });
    // }
}


// --- NEW PLOT HIGHLIGHTING LOGIC ---

// Helper: Parse character name for fuzzy matching
function getCharacterNameParts(fullName) {
    if (!fullName) {
        // Ensure this structure matches the one returned below for consistency
        return {
            fullName: '',
            cleanedFullName: '', // Property name is cleanedFullName
            firstName: '',
            lastName: '',
            allUniqueParts: []
        };
    }
    const cleanedName = fullName.replace(/\s*\(.*?\)\s*$/, '').trim(); // Variable is cleanedName
    const parts = cleanedName.split(/\s+/).filter(p => p.length > 0);
    let firstName = parts.length > 0 ? parts[0] : '';
    let lastName = parts.length > 1 ? parts[parts.length - 1] : '';

    let uniqueParts = new Set();
    if (cleanedName && cleanedName.length > 2) uniqueParts.add(cleanedName);
    if (firstName && firstName.length > 2) uniqueParts.add(firstName);
    if (lastName && lastName.length > 2 && lastName !== firstName) uniqueParts.add(lastName);
    // Add original fullName if it's different from cleanedName and significant
    if (fullName !== cleanedName && fullName.length > 2) uniqueParts.add(fullName);

    return {
        fullName: fullName,                     // Property 'fullName' gets value of variable 'fullName'
        cleanedFullName: cleanedName,           // CORRECTED: Property 'cleanedFullName' gets value of variable 'cleanedName'
        firstName: firstName,                   // Property 'firstName' gets value of variable 'firstName'
        lastName: lastName,                     // Property 'lastName' gets value of variable 'lastName'
        allUniqueParts: Array.from(uniqueParts).sort((a, b) => b.length - a.length)
    };
}

// Revised Helper: Bolds character name parts within a given raw text segment.
function highlightAllNamePartsInText(rawTextSegment, namePartHighlightRegexes) {
    if (!rawTextSegment || !namePartHighlightRegexes || namePartHighlightRegexes.length === 0) {
        return htmlEscape(rawTextSegment || '');
    }

    let matches = [];
    namePartHighlightRegexes.forEach(regex => {
        regex.lastIndex = 0; // Reset global regex state
        let match;
        while ((match = regex.exec(rawTextSegment)) !== null) {
            matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
        }
    });

    if (matches.length === 0) return htmlEscape(rawTextSegment);

    matches.sort((a, b) => a.start !== b.start ? a.start - b.start : (b.end - b.start) - (a.end - a.start));

    let nonOverlappingMatches = [];
    let lastMatchEnd = -1;
    for (const match of matches) {
        if (match.start >= lastMatchEnd) {
            nonOverlappingMatches.push(match);
            lastMatchEnd = match.end;
        }
    }

    let resultHtml = "";
    let currentIndex = 0;
    nonOverlappingMatches.forEach(match => {
        if (match.start > currentIndex) {
            resultHtml += htmlEscape(rawTextSegment.substring(currentIndex, match.start));
        }
        resultHtml += `<span class="highlighted-character">${htmlEscape(match.text)}</span>`;
        currentIndex = match.end;
    });
    if (currentIndex < rawTextSegment.length) {
        resultHtml += htmlEscape(rawTextSegment.substring(currentIndex));
    }
    return resultHtml;
}

// New Core Logic: Finds styled passages (match, context)
function findStyledPassages(rawPlot, nameInfo) {
    const passages = [];
    if (!rawPlot || !nameInfo || nameInfo.allUniqueParts.length === 0) return passages;

    const nameHitRegions = [];
    // Iterate through parts (already sorted longest to shortest by getCharacterNameParts)
    nameInfo.allUniqueParts.forEach(part => {
        const regex = new RegExp(escapeRegExp(part), 'gi');
        let match;
        while ((match = regex.exec(rawPlot)) !== null) {
            // Check if this new match is already contained within a longer, earlier found hit
            let isContained = nameHitRegions.some(region => match.index >= region.startIndex && (match.index + match[0].length) <= region.endIndex);
            if (!isContained) {
                 // Remove any previous shorter hits that are contained by this new, longer hit
                for(let i = nameHitRegions.length - 1; i >= 0; i--) {
                    if (nameHitRegions[i].startIndex >= match.index && nameHitRegions[i].endIndex <= (match.index + match[0].length)) {
                        nameHitRegions.splice(i, 1);
                    }
                }
                nameHitRegions.push({ startIndex: match.index, endIndex: match.index + match[0].length });
            }
        }
    });

    nameHitRegions.sort((a, b) => a.startIndex - b.startIndex);

    // Define passage boundaries around each name hit region
    const MAX_LOOKAROUND = 200; // Max characters to look back/forward for terminators

    nameHitRegions.forEach(hit => {
        let passageStart = hit.startIndex;
        let passageEnd = hit.endIndex;

        // Look backwards for start of passage
        let PstartSearch = Math.max(0, hit.startIndex - MAX_LOOKAROUND);
        let searchSlice = rawPlot.substring(PstartSearch, hit.startIndex);
        let lastTerminatorBefore = -1;
        const terminators = /(\.\s|[!?]\s|\n)/g; // Match period/!/? + space, or newline
        let termMatch;
        while((termMatch = terminators.exec(searchSlice)) !== null) {
            lastTerminatorBefore = PstartSearch + termMatch.index + termMatch[0].length;
        }
        passageStart = (lastTerminatorBefore !== -1) ? lastTerminatorBefore : PstartSearch;
        if (passageStart === 0 && hit.startIndex > MAX_LOOKAROUND) passageStart = hit.startIndex - MAX_LOOKAROUND; // ensure some context if no terminator found far away


        // Look forwards for end of passage
        let PendSearch = Math.min(rawPlot.length, hit.endIndex + MAX_LOOKAROUND);
        searchSlice = rawPlot.substring(hit.endIndex, PendSearch);
        terminators.lastIndex = 0; // Reset regex
        termMatch = terminators.exec(searchSlice); // Find first terminator after name
        if (termMatch !== null) {
            passageEnd = hit.endIndex + termMatch.index + termMatch[0].length - (termMatch[0].endsWith(' ') || termMatch[0].endsWith('\n') ? 1: 0) ; // end at the punctuation, not space after it
             if (termMatch[0] === '\n') passageEnd = hit.endIndex + termMatch.index; // end before newline
             else passageEnd = hit.endIndex + termMatch.index + 1; // include the punctuation mark
        } else {
            passageEnd = PendSearch;
        }
         if (passageEnd === rawPlot.length && (rawPlot.length - hit.endIndex) > MAX_LOOKAROUND) passageEnd = hit.endIndex + MAX_LOOKAROUND;


        passages.push({ startIndex: passageStart, endIndex: passageEnd, type: 'match' });

        // TODO: Add context passage logic here if desired.
        // It would involve finding the passage *before* this match passage's start,
        // and *after* this match passage's end, ensuring no overlap with other matches.
    });

    // Sort and merge overlapping/adjacent passages
    if (passages.length === 0) return [];
    passages.sort((a, b) => a.startIndex - b.startIndex);

    const mergedPassages = [passages[0]];
    for (let i = 1; i < passages.length; i++) {
        const last = mergedPassages[mergedPassages.length - 1];
        const current = passages[i];
        if (current.startIndex < last.endIndex) { // Overlap
            last.endIndex = Math.max(last.endIndex, current.endIndex);
            // if (last.type === 'context' && current.type === 'match') last.type = 'match'; // Prioritize match
        } else {
            mergedPassages.push(current);
        }
    }
    return mergedPassages;
}


// Overhauled main highlighting function
function highlightCharacterInPlot(characterName) {
    if (!rawCurrentMoviePlot || !characterName) {
        displayPlotInPanel(formattedOriginalPlotHTML, false);
        return;
    }

    const nameInfo = getCharacterNameParts(characterName);
    if (nameInfo.allUniqueParts.length === 0) {
        displayPlotInPanel(formattedOriginalPlotHTML, false);
        return;
    }

    const styledPassages = findStyledPassages(rawCurrentMoviePlot, nameInfo);
    const namePartHighlightRegexes = nameInfo.allUniqueParts.map(term => new RegExp(escapeRegExp(term), 'gi'));

    let finalHtmlSegments = [];
    let currentIndex = 0;
    const plotLines = rawCurrentMoviePlot.split('\n');

    plotLines.forEach((line, lineIndex) => {
        if (lineIndex > 0) {
            finalHtmlSegments.push('<br>');
        }
        if (!line.trim()) return; // Keep line breaks for empty lines in plot

        let currentLineStartIndexInPlot = 0;
        if (lineIndex > 0) { // Calculate start index of this line in the full plot
            currentLineStartIndexInPlot = rawCurrentMoviePlot.split('\n', lineIndex).join('\n').length + 1;
        }

        let lineHtml = "";
        let currentLocalIndex = 0; // Index within the current line

        // Filter passages relevant to the current line
        const passagesInLine = styledPassages.filter(p =>
            p.endIndex > currentLineStartIndexInPlot && p.startIndex < (currentLineStartIndexInPlot + line.length)
        ).map(p => ({ // Adjust passage indices to be relative to the line start
            startIndex: Math.max(0, p.startIndex - currentLineStartIndexInPlot),
            endIndex: Math.min(line.length, p.endIndex - currentLineStartIndexInPlot),
            type: p.type
        })).sort((a,b) => a.startIndex - b.startIndex);


        if (passagesInLine.length === 0) { // Whole line is faded
            lineHtml = `<span class="sentence-faded">${highlightAllNamePartsInText(line, namePartHighlightRegexes)}</span>`;
        } else {
            passagesInLine.forEach(passage => {
                // Faded part before this passage in the line
                if (passage.startIndex > currentLocalIndex) {
                    const segment = line.substring(currentLocalIndex, passage.startIndex);
                    lineHtml += `<span class="sentence-faded">${highlightAllNamePartsInText(segment, namePartHighlightRegexes)}</span>`;
                }
                // The styled passage itself
                const passageText = line.substring(passage.startIndex, passage.endIndex);
                lineHtml += `<span class="sentence-highlight-${passage.type}">${highlightAllNamePartsInText(passageText, namePartHighlightRegexes)}</span>`;
                currentLocalIndex = passage.endIndex;
            });
            // Faded part after the last passage in the line
            if (currentLocalIndex < line.length) {
                const segment = line.substring(currentLocalIndex);
                lineHtml += `<span class="sentence-faded">${highlightAllNamePartsInText(segment, namePartHighlightRegexes)}</span>`;
            }
        }
        finalHtmlSegments.push(lineHtml);
    });

    displayPlotInPanel(finalHtmlSegments.join(''), true);
}


// --- Network Update and Event Listeners ---
function updateNetworkForMovie(selectedMovieTitle) {
    // ... (Setup currentNodesFromMaster, currentEdgesFromMaster, rawCurrentMoviePlot) ...
    // ... (This part is largely the same, ensure rawCurrentMoviePlot and formattedOriginalPlotHTML are set) ...
    console.log(`Updating network for: ${selectedMovieTitle}`);
    let currentNodesFromMaster = []; let currentEdgesFromMaster = [];
    const selectedMovieData = allMoviesDataFromYaml.find(movie => movie.movie_title === selectedMovieTitle);

    if (selectedMovieTitle && selectedMovieTitle !== "No movies available") {
        if (selectedMovieData) {
            currentNodesFromMaster = globallyUniqueNodesMasterList.filter(node => node.movieTitle === selectedMovieTitle);
            const currentNodeIds = new Set(currentNodesFromMaster.map(n => n.id));
            currentEdgesFromMaster = globallyUniqueEdgesMasterList.filter(edge => edge.movieTitle === selectedMovieTitle && currentNodeIds.has(edge.from) && currentNodeIds.has(edge.to));
            rawCurrentMoviePlot = selectedMovieData.plot_with_character_constraints_and_relations || '';
            formattedOriginalPlotHTML = rawCurrentMoviePlot ? htmlEscape(rawCurrentMoviePlot).replace(/\n/g, "<br>") : '<p class="info-placeholder">Plot summary not available for this movie.</p>';
        } else {
            rawCurrentMoviePlot = ''; formattedOriginalPlotHTML = `<p class="info-placeholder" style="color: #ffcc00;">Plot data missing for "${selectedMovieTitle}".</p>`;
            console.warn(`Data for movie "${selectedMovieTitle}" not found.`);
        }
    } else {
        rawCurrentMoviePlot = '';
        formattedOriginalPlotHTML = selectedMovieTitle === "No movies available" ? '<p class="info-placeholder">No movies available.</p>' : '<p class="info-placeholder">Select a movie.</p>';
    }
    displayPlotInPanel(formattedOriginalPlotHTML, false); // Initial display

    const nodeDegrees = {}; /* ... (node degree calculation, same) ... */
    currentNodesFromMaster.forEach(node => { nodeDegrees[node.id] = 0; });
    currentEdgesFromMaster.forEach(edge => { nodeDegrees[edge.from] = (nodeDegrees[edge.from] || 0) + 1; nodeDegrees[edge.to] = (nodeDegrees[edge.to] || 0) + 1; });

    const processedNodes = currentNodesFromMaster.map(masterNode => { /* ... (node processing, same) ... */
        let size = Math.min(minNodeSize + ((nodeDegrees[masterNode.id] || 0) * baseSizePerConnection), maxNodeSize);
        const group = masterNode.rawGroup; const baseColor = generateAndCacheGroupColor(group);
        const dynamicNodeFontSize = calculateNodeFontSize(nodeDegrees[masterNode.id] || 0);
        return {
            id: masterNode.id, label: masterNode.label, group: group, actor_name: masterNode.actor_name,
            title: createTooltipElement(masterNode.tooltipTextData, baseColor), rawTooltipData: masterNode.tooltipTextData,
            movieTitle: masterNode.movieTitle, tmdb_person_id: masterNode.tmdb_person_id, size: size, shape: 'dot',
            color: { background: baseColor, border: defaultNodeBorderColor, highlight: { background: baseColor, border: nodeHighlightBorderColor }, hover: { background: baseColor, border: nodeHighlightBorderColor }},
            originalColorObject: { background: baseColor, border: defaultNodeBorderColor }, borderWidth: nodeDefaultBorderWidth,
            font: { size: dynamicNodeFontSize, color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40, 44, 52, 0.7)', strokeWidth: 0 },
            degree: nodeDegrees[masterNode.id] || 0
        };
    });
    let edgeVisIdCounter = 0;
    const processedEdges = currentEdgesFromMaster.map(masterEdge => { /* ... (edge processing, same) ... */
        const dynamicEdgeFontSize = calculateEdgeFontSize(masterEdge.rawStrength);
        return {
            id: `oe-${masterEdge.from}-${masterEdge.to}-${edgeVisIdCounter++}`, from: masterEdge.from, to: masterEdge.to,
            label: masterEdge.rawLabel, title: createTooltipElement(masterEdge.tooltipTextData, masterEdge.rawBaseColor),
            rawTooltipData: masterEdge.tooltipTextData, movieTitle: masterEdge.movieTitle,
            width: getEdgeWidth(masterEdge.rawStrength), originalWidth: getEdgeWidth(masterEdge.rawStrength),
            color: { color: masterEdge.rawBaseColor, highlight: masterEdge.rawBaseColor, hover: masterEdge.rawBaseColor },
            baseColor: masterEdge.rawBaseColor, arrows: masterEdge.rawArrows, sentiment: masterEdge.rawSentiment,
            font: { size: dynamicEdgeFontSize, color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40, 44, 52, 0.7)', strokeWidth: 0, align: 'middle' },
            strength: masterEdge.rawStrength
        };
    });
    const helperClusteringEdges = generateHelperEdges(processedNodes);

    if (!network) {
        allNodesDataSet = new vis.DataSet(processedNodes); allEdgesDataSet = new vis.DataSet(processedEdges);
        allEdgesDataSet.add(helperClusteringEdges);
        const container = document.getElementById('mynetwork');
        const data = { nodes: allNodesDataSet, edges: allEdgesDataSet };
        const options = { /* ... (vis.js options, same) ... */
            nodes: { font: { color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40,44,52,0.7)', strokeWidth: 0 }, scaling: { min: minNodeSize, max: maxNodeSize, label: { enabled: true, min: minNodeLabelSize, max: maxNodeLabelSize+4 }}, shadow: {enabled:true,color:'rgba(0,0,0,0.4)',size:7,x:3,y:3}, chosen: { node: (v,id,s,h)=>{ const n=allNodesDataSet.get(id); if(!n)return; if(h){v.borderColor=nodeHighlightBorderColor;v.borderWidth=nodeHighlightBorderWidth;}else{if(n.borderWidth===nodeHighlightBorderWidth&&n.color&&n.color.border===nodeHighlightBorderColor){v.borderColor=nodeHighlightBorderColor;v.borderWidth=nodeHighlightBorderWidth;}else{v.borderColor=n.originalColorObject.border;v.borderWidth=nodeDefaultBorderWidth;}}}, label:(v,id,s,h)=>{const n=allNodesDataSet.get(id);if(n){const bf=calculateNodeFontSize(n.degree);if(h)v.size=Math.min(bf+4,maxNodeLabelSize+2);else v.size=bf;}}}},
            edges: { font: { color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40,44,52,0.7)', strokeWidth: 0, align: 'middle'}, arrows:{to:{enabled:false}}, smooth:{enabled:true,type:'dynamic',roundness:0.3}, chosen:{edge:(v,id,s,h)=>{const e=allEdgesDataSet.get(id);if(e&&!e.hidden){if(h)v.width=e.originalWidth*1.8;else v.width=e.originalWidth;}},label:(v,id,s,h)=>{const e=allEdgesDataSet.get(id);if(e&&!e.hidden){const bf=calculateEdgeFontSize(e.strength);if(h)v.size=Math.min(bf+3,maxEdgeLabelSize+2);else v.size=bf;}}},color:{opacity:0.8}},
            physics: {enabled:true,solver:'forceAtlas2Based',forceAtlas2Based:{gravitationalConstant:-70,centralGravity:0.01,springLength:80,springConstant:0.07,damping:0.5,avoidOverlap:0.15},maxVelocity:40,minVelocity:0.1,stabilization:{enabled:true,iterations:1500,updateInterval:25,fit:true},adaptiveTimestep:true},
            interaction:{hover:true,hoverConnectedEdges:false,tooltipDelay:200,navigationButtons:true,keyboard:true,selectConnectedEdges:false,multiselect:false}
        };
        network = new vis.Network(container, data, options);
        setupNetworkEventListeners();
    } else {
        allNodesDataSet.clear(); allEdgesDataSet.clear();
        allNodesDataSet.add(processedNodes); allEdgesDataSet.add(processedEdges); allEdgesDataSet.add(helperClusteringEdges);
        network.setOptions({ physics: { enabled: processedNodes.length > 0 } });
        if(processedNodes.length > 0) network.stabilize(1500);
    }
    clearTimeout(physicsStopTimeout);
    if (processedNodes.length > 0) {
        physicsStopTimeout = setTimeout(stopPhysics, processedNodes.length > 100 ? 20000 : 10000);
        if (network) network.fit();
    }
    updateLegend(); updateHoverInfoPanel(null);
}

function stopPhysics() { if (network && network.physics.options.enabled) { network.setOptions({ physics: false }); console.log("Physics stopped."); } }
function resetAllHighlights() { /* ... (same) ... */
    if(!allNodesDataSet || !allEdgesDataSet) return;
    const nodeUpdates = allNodesDataSet.map(n => ({id:n.id, color:{background:n.originalColorObject.background, border:n.originalColorObject.border}, borderWidth:nodeDefaultBorderWidth, font:{...n.font, size:calculateNodeFontSize(n.degree)}}));
    if(nodeUpdates.length > 0) allNodesDataSet.update(nodeUpdates);
    const edgeUpdates = allEdgesDataSet.get({filter:i=>i.id&&typeof i.id==='string'&&i.id.startsWith('oe-')}).map(e=>({id:e.id, color:{color:e.baseColor,highlight:e.baseColor,hover:e.baseColor}, width:e.originalWidth, font:{...e.font, size:calculateEdgeFontSize(e.strength)}}));
    if(edgeUpdates.length > 0) allEdgesDataSet.update(edgeUpdates);
}
function setupNetworkEventListeners() {
    if (!network) return;
    network.on("stabilizationIterationsDone", () => { clearTimeout(physicsStopTimeout); physicsStopTimeout = setTimeout(stopPhysics, 1500); });
    network.on("click", function (params) { /* ... (same click highlighting logic) ... */
        resetAllHighlights();
        if (params.nodes.length > 0) {
            const n = allNodesDataSet.get(params.nodes[0]); if (!n) return; const g = n.group; const nu = [];
            allNodesDataSet.forEach(node => { if (node.group === g) nu.push({id:node.id, color:{background:node.originalColorObject.background, border:nodeHighlightBorderColor}, borderWidth:nodeHighlightBorderWidth}); });
            if (nu.length > 0) allNodesDataSet.update(nu);
        } else if (params.edges.length > 0) {
            const e = allEdgesDataSet.get(params.edges[0]); if (e && !e.hidden) {
                const s = e.sentiment; const c = e.baseColor; const eu = []; const ntc = new Set();
                allEdgesDataSet.get({filter:item=>item.id&&typeof item.id==='string'&&item.id.startsWith('oe-')}).forEach(ei=>{if(ei.sentiment===s){const hfs=Math.min(calculateEdgeFontSize(ei.strength)+3,maxEdgeLabelSize+2);eu.push({id:ei.id,width:ei.originalWidth*1.8,font:{...ei.font,size:hfs}});ntc.add(ei.from);ntc.add(ei.to);}});
                if(eu.length > 0) allEdgesDataSet.update(eu);
                const nu = []; ntc.forEach(nid=>{const node=allNodesDataSet.get(nid); if(node)nu.push({id:nid,color:{background:c,border:node.originalColorObject.border},borderWidth:nodeDefaultBorderWidth});});
                if(nu.length > 0) allNodesDataSet.update(nu);
            }
        }
    });
    network.on("hoverNode", function (params) {
        const nodeData = allNodesDataSet.get(params.node);
        if (nodeData) { updateHoverInfoPanel(nodeData, 'node'); highlightCharacterInPlot(nodeData.label); }
    });
    network.on("blurNode", function () { updateHoverInfoPanel(null); displayPlotInPanel(formattedOriginalPlotHTML, false); });
    network.on("hoverEdge", function (params) {
        const edgeData = allEdgesDataSet.get(params.edge);
        if (edgeData && !edgeData.hidden) updateHoverInfoPanel(edgeData, 'edge'); else if (edgeData && edgeData.hidden) updateHoverInfoPanel(null);
    });
    network.on("blurEdge", function () { updateHoverInfoPanel(null); });
    window.addEventListener('resize', function() { if (network) network.fit(); });
}

// Main function
async function main() {
    try {
        const response = await fetch('clean_movie_database.yaml');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allMoviesDataFromYaml = jsyaml.load(await response.text());
        processAllDataFromYaml(); populateMovieSelector();
        const initialMovie = document.getElementById('movieSelector').value;
        if (initialMovie && initialMovie !== "No movies available") updateNetworkForMovie(initialMovie);
        else {
            console.log("No movies available to display.");
            const container = document.getElementById('mynetwork');
            if (container) container.innerHTML = `<p style="color:#abb2bf; text-align:center; padding:20px;">No movies in database.</p>`;
            updateLegend(); updateHoverInfoPanel(null);
            displayPlotInPanel('<p class="info-placeholder">No plot summary; no movies available.</p>', false);
        }
        console.log("Script fully loaded.");
    } catch (error) {
        console.error("Failed to load/process YAML data:", error);
        const container = document.getElementById('mynetwork');
        if (container) container.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Error: ${error.message}</p>`;
        updateLegend(); updateHoverInfoPanel(null);
        displayPlotInPanel(`<p class="info-placeholder" style="color:red;">Plot error: ${error.message}</p>`, false);
    }
}

main();