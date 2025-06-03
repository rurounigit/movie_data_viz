// js/uiUpdater.js
import * as config from './config.js';
import * as utils from './utils.js';

export function updateLegend(allNodesDataSet, allEdgesDataSet) {
    const legendContainer = document.getElementById('legend');
    if (!legendContainer) {
        console.error("Legend container not found.");
        return;
    }
    legendContainer.innerHTML = ''; // Clear previous legend

    const groupsTitle = document.createElement('h3');
    groupsTitle.textContent = 'Character Groups';
    legendContainer.appendChild(groupsTitle);

    const currentGroupsInView = new Set();
    if (allNodesDataSet && typeof allNodesDataSet.forEach === 'function') {
        allNodesDataSet.forEach(node => currentGroupsInView.add(node.group));
    }

    const generatedColors = utils.getGeneratedGroupColorsCache();

    if (currentGroupsInView.size === 0 && (!allNodesDataSet || allNodesDataSet.length === 0)) {
        const placeholder = document.createElement('p');
        placeholder.className = 'info-placeholder';
        placeholder.textContent = 'No character groups to display.';
        legendContainer.appendChild(placeholder);
    } else {
        Object.keys(generatedColors)
            .filter(gName => currentGroupsInView.has(gName))
            .sort()
            .forEach(gName => {
                const color = generatedColors[gName];
                const item = document.createElement('div');
                item.className = 'legend-item';
                const box = document.createElement('div');
                box.className = 'legend-color-box';
                box.style.backgroundColor = color;
                const text = document.createElement('span');
                text.className = 'legend-text';
                text.textContent = gName;
                item.appendChild(box);
                item.appendChild(text);
                legendContainer.appendChild(item);
            });
    }

    const sentimentsTitle = document.createElement('h3');
    sentimentsTitle.style.marginTop = '15px';
    sentimentsTitle.textContent = 'Relationship Sentiments';
    legendContainer.appendChild(sentimentsTitle);

    const sentimentOrder = ['positive', 'negative', 'complicated', 'neutral'];
    const currentSentimentsInView = new Set();
    if (allEdgesDataSet && typeof allEdgesDataSet.get === 'function') {
        allEdgesDataSet.get({ filter: e => !e.hidden && e.sentiment })
                       .forEach(e => currentSentimentsInView.add(e.sentiment));
    }

    if (currentSentimentsInView.size === 0 && (!allEdgesDataSet || allEdgesDataSet.get({ filter: e => !e.hidden }).length === 0)) {
        const placeholder = document.createElement('p');
        placeholder.className = 'info-placeholder';
        placeholder.textContent = 'No sentiments to display.';
        legendContainer.appendChild(placeholder);
    } else {
        const sortedSentimentKeys = sentimentOrder
            .filter(k => config.sentimentColors.hasOwnProperty(k) && currentSentimentsInView.has(k));

        // Add any other sentiments present that might not be in the predefined order
        currentSentimentsInView.forEach(sName => {
            if (!sortedSentimentKeys.includes(sName) && config.sentimentColors.hasOwnProperty(sName)) {
                sortedSentimentKeys.push(sName);
            }
        });

        sortedSentimentKeys.forEach(sName => {
            const color = config.sentimentColors[sName];
            const item = document.createElement('div');
            item.className = 'legend-item';
            const box = document.createElement('div');
            box.className = 'legend-color-box';
            box.style.backgroundColor = color;
            const text = document.createElement('span');
            text.className = 'legend-text';
            text.textContent = sName.charAt(0).toUpperCase() + sName.slice(1);
            item.appendChild(box);
            item.appendChild(text);
            legendContainer.appendChild(item);
        });
    }
}

export function addInfoItem(panel, key, value, isBlockValue = false) {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'info-item';
    const keySpan = document.createElement('span');
    keySpan.className = 'info-key';
    keySpan.textContent = key;
    const valueSpan = document.createElement('span');
    valueSpan.className = 'info-value';
    if (isBlockValue) {
        valueSpan.style.whiteSpace = 'pre-wrap'; // For multi-line descriptions
    }
    valueSpan.textContent = value;
    itemDiv.appendChild(keySpan);
    itemDiv.appendChild(valueSpan);
    panel.appendChild(itemDiv);
}

export function updateHoverInfoPanel(itemData, type, allNodesDataSet) {
    const panel = document.getElementById('hoverInfoPanel');
    if (!panel) {
        console.error("Hover info panel not found.");
        return;
    }
    panel.innerHTML = ''; // Clear previous content

    if (!itemData) {
        panel.innerHTML = '<p class="info-placeholder">Hover over an item for details.</p>';
        return;
    }

    const titleElement = document.createElement('h3');
    let description = '';

    if (itemData.rawTooltipData) {
        const parts = itemData.rawTooltipData.split('\n\n');
        if (parts.length > 1) {
            description = parts.slice(1).join('\n\n').trim();
            // Clean up "(Played by: ...)" if it's part of the generic description start
            if (description.startsWith("(Played by:")) {
                const firstNewLineIndex = description.indexOf('\n');
                description = (firstNewLineIndex !== -1) ? description.substring(firstNewLineIndex + 1).trim() : '';
            }
        }
        if (description === 'No description available.' || description === 'No specific details.') {
            description = ''; // Don't show these placeholders
        }
    }

    if (type === 'node' && itemData) {
        titleElement.textContent = 'Character Details';
        panel.appendChild(titleElement);
        addInfoItem(panel, 'Name:', itemData.label);
        addInfoItem(panel, 'Actor:', itemData.actor_name);

        if (itemData.tmdb_person_id || itemData.label) {
            const imagePanelDiv = document.createElement('div');
            imagePanelDiv.className = 'info-images-container';
            imagePanelDiv.style.cssText = 'display: flex; justify-content: space-around; align-items: center; gap: 10px; margin-top: 10px; margin-bottom: 10px;';

            const actorImg = document.createElement('img');
            actorImg.alt = `Actor: ${itemData.actor_name || 'N/A'}`;
            actorImg.className = 'info-panel-image';
            actorImg.style.cssText = 'max-width: 80px; max-height: 120px; display: none; border-radius: 4px;';

            const charImg = document.createElement('img');
            charImg.alt = `Character: ${itemData.label || 'N/A'}`;
            charImg.className = 'info-panel-image';
            charImg.style.cssText = 'max-width: 80px; max-height: 120px; display: none; border-radius: 4px;';

            imagePanelDiv.appendChild(actorImg);
            imagePanelDiv.appendChild(charImg);

            let actorLoaded = false, charLoaded = false;
            const tryLoad = (imgEl, prefix, exts, cb) => {
                let i = 0;
                const attempt = () => {
                    if (i < exts.length) {
                        imgEl.src = `${config.IMAGE_BASE_PATH}${prefix}${exts[i]}`;
                        imgEl.onload = () => { imgEl.style.display = 'block'; cb(true); };
                        imgEl.onerror = () => { i++; attempt(); };
                    } else {
                        imgEl.style.display = 'none'; cb(false);
                    }
                };
                attempt();
            };

            const updateContainerVisibility = () => {
                imagePanelDiv.style.display = (actorLoaded || charLoaded) ? 'flex' : 'none';
            };

            let actorAttemptDone = !itemData.tmdb_person_id;
            let charAttemptDone = !itemData.label;

            if (itemData.tmdb_person_id) {
                tryLoad(actorImg, itemData.tmdb_person_id, config.COMMON_IMAGE_EXTENSIONS, success => {
                    actorLoaded = success; actorAttemptDone = true;
                    if (charAttemptDone) updateContainerVisibility();
                });
            }
            if (itemData.label) {
                let charFileBase = itemData.tmdb_person_id
                    ? `${itemData.tmdb_person_id}_char_${utils.slugify(itemData.label)}_1`
                    : `${utils.slugify(itemData.label)}_char_unknown_id_1`;
                tryLoad(charImg, charFileBase, config.COMMON_IMAGE_EXTENSIONS, success => {
                    charLoaded = success; charAttemptDone = true;
                    if (actorAttemptDone) updateContainerVisibility();
                });
            }
            panel.appendChild(imagePanelDiv);
            if (!actorAttemptDone || !charAttemptDone) { // If any attempt is pending, hide initially
                imagePanelDiv.style.display = 'none';
            } else { // Otherwise, update based on loaded status
                updateContainerVisibility();
            }
        }
        addInfoItem(panel, 'Group:', itemData.group);
        if (description) addInfoItem(panel, 'Description:', description, true);

    } else if (type === 'edge' && itemData && allNodesDataSet) {
        titleElement.textContent = 'Relationship Details';
        panel.appendChild(titleElement);
        const fromNode = allNodesDataSet.get(itemData.from);
        const toNode = allNodesDataSet.get(itemData.to);
        addInfoItem(panel, 'Type:', itemData.label || "N/A");
        addInfoItem(panel, 'From:', fromNode ? fromNode.label : `ID: ${itemData.from}`);
        addInfoItem(panel, 'To:', toNode ? toNode.label : `ID: ${itemData.to}`);
        addInfoItem(panel, 'Sentiment:', itemData.sentiment ? (itemData.sentiment.charAt(0).toUpperCase() + itemData.sentiment.slice(1)) : "N/A");
        if (description) addInfoItem(panel, 'Description:', description, true);

        if (fromNode && fromNode.label && toNode && toNode.label) {
            const relImagePanelDiv = document.createElement('div');
            relImagePanelDiv.style.cssText = 'margin-top: 10px; display: none; text-align: center;';
            const relImg = document.createElement('img');
            relImg.alt = `Visual: ${fromNode.label} & ${toNode.label}`;
            relImg.className = 'info-panel-image';
            relImg.style.cssText = 'max-width: 90%; max-height: 150px; display: none; margin: 0 auto; border-radius: 4px;';
            relImagePanelDiv.appendChild(relImg);
            panel.appendChild(relImagePanelDiv);

            const slugSrc = utils.slugify(fromNode.label);
            const slugTgt = utils.slugify(toNode.label);
            const p1 = `rel_${slugSrc}_${slugTgt}_1`;
            const p2 = `rel_${slugTgt}_${slugSrc}_1`;

            const tryLoadRel = (imgEl, prefix, exts, cb) => {
                let i = 0;
                const attempt = () => {
                    if (i < exts.length) {
                        imgEl.src = `${config.IMAGE_BASE_PATH}${prefix}${exts[i]}`;
                        imgEl.onload = () => { imgEl.style.display = 'block'; cb(true); };
                        imgEl.onerror = () => { i++; attempt(); };
                    } else {
                        imgEl.style.display = 'none'; cb(false);
                    }
                };
                attempt();
            };

            tryLoadRel(relImg, p1, config.COMMON_IMAGE_EXTENSIONS, success1 => {
                if (success1) {
                    relImagePanelDiv.style.display = 'block';
                } else {
                    tryLoadRel(relImg, p2, config.COMMON_IMAGE_EXTENSIONS, success2 => {
                        if (success2) relImagePanelDiv.style.display = 'block';
                    });
                }
            });
        }

    } else {
        panel.innerHTML = '<p class="info-placeholder">Hover over an item for details.</p>';
    }
}

export function displayPlotInPanel(htmlContentForPlotArea, isHighlightingActive = false) {
    const plotPanel = document.getElementById('plotSummaryPanel');
    if (!plotPanel) {
        console.error("Plot summary panel not found.");
        return;
    }

    let titleElement = plotPanel.querySelector('h3.plot-title');
    if (!titleElement) {
        titleElement = document.createElement('h3');
        titleElement.className = 'plot-title';
        titleElement.textContent = 'Plot Summary';
        titleElement.style.cssText = 'margin-top:0; margin-bottom:10px; font-size:1.1em; color:#dedede; border-bottom:1px solid #434343; padding-bottom:5px;';
        plotPanel.insertBefore(titleElement, plotPanel.firstChild);
    }

    let contentDiv = plotPanel.querySelector('.plot-content-area');
    if (!contentDiv) {
        contentDiv = document.createElement('div');
        contentDiv.className = 'plot-content-area'; // Used for scrolling if content overflows
        plotPanel.appendChild(contentDiv);
    }
    contentDiv.innerHTML = htmlContentForPlotArea;

    // Optional: Add animation class if needed, though CSS transitions are often preferred.
    // if (isHighlightingActive) {
    //     requestAnimationFrame(() => {
    //         const elementsToAnimate = contentDiv.querySelectorAll('.sentence-faded, .sentence-highlight-match, .sentence-highlight-context');
    //         elementsToAnimate.forEach(el => el.classList.add('applied'));
    //     });
    // }
}