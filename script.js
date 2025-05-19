// script.js - Full version with hover info panel, legend, dynamic settings.
// Test

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

// Font size parameters
const minNodeLabelSize = 20;
const maxNodeLabelSize = 44;
const nodeLabelDegreeScaleFactor = 5;
const minEdgeLabelSize = 18;
const maxEdgeLabelSize = 38;
const edgeLabelStrengthScaleFactor = 2.5;

// Color System Variables
const SENTIMENT_COLORS_HEX = ["#2ca02c", "#d62728", "#ff7f0e", "#7f7f7f"]; // positive, negative, complicated, neutral
let generatedGroupColorsCache = {};
let lastHue = Math.random() * 360;
const HUE_INCREMENT = 137.508;
const FIXED_GROUP_SATURATION = 50;
const FIXED_GROUP_LIGHTNESS = 30;

const sentimentColors = {
    positive: SENTIMENT_COLORS_HEX[0],
    negative: SENTIMENT_COLORS_HEX[1],
    complicated: SENTIMENT_COLORS_HEX[2],
    neutral: SENTIMENT_COLORS_HEX[3]
};

const defaultNodeBorderColor = '#3b4048';
const nodeHighlightBorderColor = '#61afef';
const nodeHighlightBorderWidth = 3; const nodeDefaultBorderWidth = 2;

const baseNodeFontSizeForReset = 24;
const baseEdgeFontSizeForReset = 21;

let physicsStopTimeout;

// Helper function to get contrasting text color
function getTextColorForBackground(hexColor) {
  if (!hexColor) return '#e0e0e0';
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  return brightness > 127.5 ? '#000000' : '#FFFFFF';
}

// Helper function to create a styled HTML element for tooltips
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

// Helper function to get edge width
function getEdgeWidth(strength) {
  if (strength === 5) return 25; if (strength === 4) return 15;
  if (strength === 3) return 6;  if (strength === 2) return 2;
  return 1;
}

// Helper Functions for Dynamic Font Sizes
function calculateNodeFontSize(degree) {
    let fontSize = minNodeLabelSize + (degree * nodeLabelDegreeScaleFactor);
    return Math.min(fontSize, maxNodeLabelSize);
}

function calculateEdgeFontSize(strength) {
    let fontSize = minEdgeLabelSize + ((strength -1) * edgeLabelStrengthScaleFactor);
    return Math.min(fontSize, maxEdgeLabelSize);
}

// Helper Functions for Dynamic Group Colors
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function generateAndCacheGroupColor(groupName) {
    if (generatedGroupColorsCache[groupName]) {
        return generatedGroupColorsCache[groupName];
    }
    if (groupName === 'Unknown') {
        generatedGroupColorsCache[groupName] = '#bdbdbd';
        return generatedGroupColorsCache[groupName];
    }

    let newColorHex;
    let attempts = 0;
    const maxColorGenAttempts = 20;

    do {
        lastHue = (lastHue + HUE_INCREMENT) % 360;
        newColorHex = hslToHex(lastHue, FIXED_GROUP_SATURATION, FIXED_GROUP_LIGHTNESS);
        attempts++;
    } while (SENTIMENT_COLORS_HEX.includes(newColorHex.toLowerCase()) && attempts < maxColorGenAttempts);

    if (attempts >= maxColorGenAttempts && SENTIMENT_COLORS_HEX.includes(newColorHex.toLowerCase())) {
        console.warn(`Could not generate a highly distinct color for group ${groupName}. Using: ${newColorHex}`);
        newColorHex = hslToHex(lastHue, FIXED_GROUP_SATURATION, FIXED_GROUP_LIGHTNESS - 10 > 0 ? FIXED_GROUP_LIGHTNESS - 10 : FIXED_GROUP_LIGHTNESS + 10);
    }

    generatedGroupColorsCache[groupName] = newColorHex;
    console.log(`Generated color for group "${groupName}": ${newColorHex}`);
    return newColorHex;
}

// Process all data from YAML into master lists
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
                    id: globalId,
                    label: character.name,
                    rawGroup: character.group || 'Unknown',
                    tooltipTextData: `${character.name || 'Unknown Character'}\n\n${character.description || 'No description available.'}`,
                    movieTitle: movieTitle,
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
                        from: fromId,
                        to: toId,
                        rawLabel: rel.type || "",
                        rawStrength: rel.strength || 1,
                        tooltipTextData: `${rel.type || 'Relationship'}: ${rel.source} & ${rel.target}\n\n${rel.description || 'No specific details.'}`,
                        rawBaseColor: sentimentColors[rel.sentiment] || sentimentColors.neutral,
                        rawArrows: { to: { enabled: false } },
                        rawSentiment: rel.sentiment || 'neutral',
                        movieTitle: movieTitle,
                    });
                } else {
                    console.warn(`Could not map edge for movie "${movieTitle}": ${rel.source} -> ${rel.target}. One or both characters not found.`);
                }
            });
        }
    });
}

// Populate the movie selector dropdown
function populateMovieSelector() {
    const selector = document.getElementById('movieSelector');
    selector.innerHTML = '';

    const movieTitles = [...new Set(allMoviesDataFromYaml.map(m => m.movie_title))].sort();
    print("Populating movie selector with movie titles: " + movieTitles);

    if (movieTitles.length > 0) {
        movieTitles.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            selector.appendChild(option);
        });
        selector.value = movieTitles[0];
    } else {
        const option = document.createElement('option');
        option.textContent = "No movies available";
        option.disabled = true;
        selector.appendChild(option);
    }

    selector.addEventListener('change', (event) => {
        updateNetworkForMovie(event.target.value);
    });
}

// Generate helper edges for clustering
function generateHelperEdges(nodesForClustering) {
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
          helperEdges.push({
            from: nodeIdsInGroup[i], to: nodeIdsInGroup[j],
            hidden: true, color: {opacity: 0.1}
          });
        }
      }
    }
  }
  return helperEdges;
}

// Function to Update the Legend
function updateLegend() {
    const legendContainer = document.getElementById('legend');
    if (!legendContainer) return;

    legendContainer.innerHTML = '';

    const groupsTitle = document.createElement('h3');
    groupsTitle.textContent = 'Character Groups';
    legendContainer.appendChild(groupsTitle);

    const currentGroupsInView = new Set();
    if (allNodesDataSet) {
        allNodesDataSet.forEach(node => {
            currentGroupsInView.add(node.group);
        });
    }

    const sortedGroupNames = Object.keys(generatedGroupColorsCache)
        .filter(groupName => currentGroupsInView.has(groupName))
        .sort();

    sortedGroupNames.forEach(groupName => {
        const color = generatedGroupColorsCache[groupName];
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color-box';
        colorBox.style.backgroundColor = color;

        const text = document.createElement('span');
        text.className = 'legend-text';
        text.textContent = groupName;

        legendItem.appendChild(colorBox);
        legendItem.appendChild(text);
        legendContainer.appendChild(legendItem);
    });

    const sentimentsTitle = document.createElement('h3');
    sentimentsTitle.style.marginTop = '15px';
    sentimentsTitle.textContent = 'Relationship Sentiments';
    legendContainer.appendChild(sentimentsTitle);

    const sentimentOrder = ['positive', 'negative', 'complicated', 'neutral'];
    const sortedSentimentKeys = sentimentOrder.filter(key => sentimentColors.hasOwnProperty(key));
    Object.keys(sentimentColors).forEach(key => {
        if (!sortedSentimentKeys.includes(key)) {
            sortedSentimentKeys.push(key);
        }
    });

    sortedSentimentKeys.forEach(sentimentName => {
        const color = sentimentColors[sentimentName];
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';

        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color-box';
        colorBox.style.backgroundColor = color;

        const text = document.createElement('span');
        text.className = 'legend-text';
        text.textContent = sentimentName.charAt(0).toUpperCase() + sentimentName.slice(1);

        legendItem.appendChild(colorBox);
        legendItem.appendChild(text);
        legendContainer.appendChild(legendItem);
    });
}

// --- Function to Update the Hover Info Panel ---
function updateHoverInfoPanel(itemData, type) {
    const panel = document.getElementById('hoverInfoPanel');
    if (!panel) return;

    panel.innerHTML = '';

    if (!itemData) {
        panel.innerHTML = '<p class="info-placeholder">Hover over a character or relationship for details.</p>';
        return;
    }

    const title = document.createElement('h3');
    let description = '';

    if (itemData.rawTooltipData) {
        const parts = itemData.rawTooltipData.split('\n\n');
        if (parts.length > 1) {
            description = parts.slice(1).join('\n\n').trim();
        } else if (parts.length === 1 && itemData.label && !parts[0].toLowerCase().includes(itemData.label.toLowerCase())) {
            description = parts[0].trim();
        }
         if (description === 'No description available.' || description === 'No specific details.') {
            description = '';
        }
    }

    if (type === 'node' && itemData) {
        title.textContent = 'Character Details';
        panel.appendChild(title);

        addInfoItem(panel, 'Name:', itemData.label);
        addInfoItem(panel, 'Group:', itemData.group);
      /*addInfoItem(panel, 'Movie:', itemData.movieTitle);*/
      /* addInfoItem(panel, 'Connections:', itemData.degree); */
        if (description) addInfoItem(panel, 'Description:', description, true);

    } else if (type === 'edge' && itemData) {
        title.textContent = 'Relationship Details';
        panel.appendChild(title);

        const fromNode = allNodesDataSet.get(itemData.from);
        const toNode = allNodesDataSet.get(itemData.to);

        addInfoItem(panel, 'Type:', itemData.label || "N/A");
        addInfoItem(panel, 'From:', fromNode ? fromNode.label : `ID: ${itemData.from}`);
        addInfoItem(panel, 'To:', toNode ? toNode.label : `ID: ${itemData.to}`);
        addInfoItem(panel, 'Sentiment:', itemData.sentiment ? (itemData.sentiment.charAt(0).toUpperCase() + itemData.sentiment.slice(1)) : "N/A");
       /* addInfoItem(panel, 'Strength:', itemData.strength); */
       /* addInfoItem(panel, 'Movie:', itemData.movieTitle); */
        if (description) addInfoItem(panel, 'Description:', description, true);

    } else {
         panel.innerHTML = '<p class="info-placeholder">Hover over a character or relationship for details.</p>';
    }
}

function addInfoItem(panel, key, value, isBlockValue = false) {
    if (value === undefined || value === null || value === '') return;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'info-item';

    const keySpan = document.createElement('span');
    keySpan.className = 'info-key';
    keySpan.textContent = key;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'info-value';
    if (isBlockValue) {
        valueSpan.style.whiteSpace = 'pre-wrap';
    }
    valueSpan.textContent = value;

    itemDiv.appendChild(keySpan);
    itemDiv.appendChild(valueSpan);
    panel.appendChild(itemDiv);
}

// Update the Vis.js network based on selected movie
function updateNetworkForMovie(selectedMovieTitle) {
    console.log(`Updating network for: ${selectedMovieTitle}`);

    let currentNodesFromMaster = [];
    let currentEdgesFromMaster = [];

    // The "All Movies" option is removed.
    if (selectedMovieTitle && selectedMovieTitle !== "No movies available") { // Check if a valid movie is selected
        currentNodesFromMaster = globallyUniqueNodesMasterList.filter(node => node.movieTitle === selectedMovieTitle);
        const currentNodeIds = new Set(currentNodesFromMaster.map(n => n.id));
        currentEdgesFromMaster = globallyUniqueEdgesMasterList.filter(edge =>
            edge.movieTitle === selectedMovieTitle &&
            currentNodeIds.has(edge.from) &&
            currentNodeIds.has(edge.to)
        );
    } else { // Handle case of no valid movie selection (e.g., "No movies available")
        currentNodesFromMaster = [];
        currentEdgesFromMaster = [];
    }


    const nodeDegrees = {};
    currentNodesFromMaster.forEach(node => { nodeDegrees[node.id] = 0; });
    currentEdgesFromMaster.forEach(edge => {
        nodeDegrees[edge.from] = (nodeDegrees[edge.from] || 0) + 1;
        nodeDegrees[edge.to] = (nodeDegrees[edge.to] || 0) + 1;
    });

    const processedNodes = currentNodesFromMaster.map(masterNode => {
        let size = minNodeSize + ((nodeDegrees[masterNode.id] || 0) * baseSizePerConnection);
        if (size > maxNodeSize) size = maxNodeSize;
        const group = masterNode.rawGroup;
        const baseColor = generateAndCacheGroupColor(group);
        const dynamicNodeFontSize = calculateNodeFontSize(nodeDegrees[masterNode.id] || 0);
        return {
            id: masterNode.id,
            label: masterNode.label,
            group: group,
            title: createTooltipElement(masterNode.tooltipTextData, baseColor),
            rawTooltipData: masterNode.tooltipTextData, // For hover info panel
            movieTitle: masterNode.movieTitle,          // For hover info panel
            size: size,
            shape: 'dot',
            color: {
                background: baseColor, border: defaultNodeBorderColor,
                highlight: { background: baseColor, border: nodeHighlightBorderColor },
                hover: { background: baseColor, border: nodeHighlightBorderColor }
            },
            originalColorObject: { background: baseColor, border: defaultNodeBorderColor },
            borderWidth: nodeDefaultBorderWidth,
            font: {
                size: dynamicNodeFontSize,
                color: '#abb2bf',
                face: 'Roboto, sans-serif',
                background: 'rgba(40, 44, 52, 0.7)',
                strokeWidth: 0
            },
            degree: nodeDegrees[masterNode.id] || 0
        };
    });

    let edgeVisIdCounter = 0;
    const processedEdges = currentEdgesFromMaster.map(masterEdge => {
        const dynamicEdgeFontSize = calculateEdgeFontSize(masterEdge.rawStrength);
        return {
            id: `oe-${masterEdge.from}-${masterEdge.to}-${edgeVisIdCounter++}`,
            from: masterEdge.from,
            to: masterEdge.to,
            label: masterEdge.rawLabel,
            title: createTooltipElement(masterEdge.tooltipTextData, masterEdge.rawBaseColor),
            rawTooltipData: masterEdge.tooltipTextData, // For hover info panel
            movieTitle: masterEdge.movieTitle,          // For hover info panel
            width: getEdgeWidth(masterEdge.rawStrength),
            originalWidth: getEdgeWidth(masterEdge.rawStrength),
            color: { color: masterEdge.rawBaseColor, highlight: masterEdge.rawBaseColor, hover: masterEdge.rawBaseColor },
            baseColor: masterEdge.rawBaseColor,
            arrows: masterEdge.rawArrows,
            sentiment: masterEdge.rawSentiment,
            font: {
                size: dynamicEdgeFontSize,
                color: '#abb2bf',
                face: 'Roboto, sans-serif',
                background: 'rgba(40, 44, 52, 0.7)',
                strokeWidth: 0,
                align: 'middle'
            },
            strength: masterEdge.rawStrength
        };
    });

    const helperClusteringEdges = generateHelperEdges(processedNodes);

    if (!network) {
        allNodesDataSet = new vis.DataSet(processedNodes);
        allEdgesDataSet = new vis.DataSet(processedEdges);
        allEdgesDataSet.add(helperClusteringEdges);

        const container = document.getElementById('mynetwork');
        const data = { nodes: allNodesDataSet, edges: allEdgesDataSet };
        const options = {
            nodes: {
                font: { color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40, 44, 52, 0.7)', strokeWidth: 0 },
                scaling: { min: minNodeSize, max: maxNodeSize,
                           label: { enabled: true, min: minNodeLabelSize, max: maxNodeLabelSize+4 }
                },
                shadow: { enabled: true, color: 'rgba(0,0,0,0.4)', size:7, x:3, y:3},
                chosen: {
                    node: function(values, id, selected, hovering) {
                        const node = allNodesDataSet.get(id);
                        if (!node) return;

                        if (hovering) {
                            values.borderColor = nodeHighlightBorderColor;
                            values.borderWidth = nodeHighlightBorderWidth;
                        } else {
                            if (node.borderWidth === nodeHighlightBorderWidth && node.color && node.color.border === nodeHighlightBorderColor) {
                                values.borderColor = nodeHighlightBorderColor;
                                values.borderWidth = nodeHighlightBorderWidth;
                            } else {
                                values.borderColor = node.originalColorObject.border;
                                values.borderWidth = nodeDefaultBorderWidth;
                            }
                        }
                    },
                    label: function(values, id, selected, hovering) {
                        const node = allNodesDataSet.get(id);
                        if (node) {
                            const baseFontSize = calculateNodeFontSize(node.degree);
                            if (hovering) values.size = Math.min(baseFontSize + 4, maxNodeLabelSize + 2);
                            else values.size = baseFontSize;
                        }
                    }
                }
            },
            edges: {
                font: { color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40, 44, 52, 0.7)', strokeWidth: 0, align: 'middle' },
                arrows: { to: { enabled: false } },
                smooth: { enabled: true, type: 'dynamic', roundness: 0.3 },
                chosen: {
                    edge: function(values, id, selected, hovering) {
                        const edge = allEdgesDataSet.get(id);
                        if (edge && !edge.hidden) {
                            if (hovering) values.width = edge.originalWidth * 1.8;
                            else values.width = edge.originalWidth;
                        }
                    },
                    label: function(values, id, selected, hovering) {
                        const edge = allEdgesDataSet.get(id);
                        if (edge && !edge.hidden) {
                            const baseFontSize = calculateEdgeFontSize(edge.strength);
                            if (hovering) values.size = Math.min(baseFontSize + 3, maxEdgeLabelSize + 2);
                            else values.size = baseFontSize;
                        }
                    }
                },
                color: { opacity: 0.8 }
            },
            physics: {
                enabled: true, solver: 'forceAtlas2Based',
                forceAtlas2Based: { gravitationalConstant: -70, centralGravity: 0.01, springLength: 80, springConstant: 0.07, damping: 0.5, avoidOverlap: 0.15 },
                maxVelocity: 40, minVelocity: 0.1,
                stabilization: { enabled: true, iterations: 1500, updateInterval: 25, fit: true },
                adaptiveTimestep: true
            },
            interaction: {
                hover: true, hoverConnectedEdges: false, tooltipDelay: 200,
                navigationButtons: true, keyboard: true, selectConnectedEdges: false, multiselect: false
            }
        };
        network = new vis.Network(container, data, options);
        setupNetworkEventListeners();
    } else {
        allNodesDataSet.clear();
        allEdgesDataSet.clear();
        allNodesDataSet.add(processedNodes);
        allEdgesDataSet.add(processedEdges);
        allEdgesDataSet.add(helperClusteringEdges);
        network.setOptions({ physics: { enabled: true } });
        network.stabilize(1500);
    }

    clearTimeout(physicsStopTimeout);
    physicsStopTimeout = setTimeout(stopPhysics, processedNodes.length > 100 ? 20000 : 10000);
    if (network) network.fit();

    updateLegend();
    updateHoverInfoPanel(null); // Clear hover panel on network update
}

function stopPhysics() {
    if (network && network.physics.options.enabled) {
        network.setOptions({ physics: false });
        console.log("Physics stopped.");
    }
}

function resetAllHighlights() {
    if (!allNodesDataSet || !allEdgesDataSet) return;
    const nodeUpdates = allNodesDataSet.map(node => {
        const baseFontSize = node.font && node.font.size !== undefined ? calculateNodeFontSize(node.degree) : baseNodeFontSizeForReset;
        return {
            id: node.id,
            color: { background: node.originalColorObject.background, border: node.originalColorObject.border },
            borderWidth: nodeDefaultBorderWidth,
            font: { ...node.font, size: baseFontSize }
        };
    });
    if (nodeUpdates.length > 0) allNodesDataSet.update(nodeUpdates);

    const edgeUpdates = allEdgesDataSet.get({
        filter: item => item.id && typeof item.id === 'string' && item.id.startsWith('oe-')
    }).map(e => {
        const baseFontSize = e.font && e.font.size !== undefined ? calculateEdgeFontSize(e.strength) : baseEdgeFontSizeForReset;
        return {
            id: e.id,
            color: { color: e.baseColor, highlight: e.baseColor, hover: e.baseColor },
            width: e.originalWidth,
            font: { ...e.font, size: baseFontSize }
        };
    });
    if (edgeUpdates.length > 0) allEdgesDataSet.update(edgeUpdates);
}

function setupNetworkEventListeners() {
    if (!network) return;

    network.on("stabilizationIterationsDone", () => {
        console.log("Stabilization iterations done.");
        clearTimeout(physicsStopTimeout);
        physicsStopTimeout = setTimeout(stopPhysics, 1500);
    });

    network.on("click", function (params) {
        resetAllHighlights();
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const clickedNodeDetails = allNodesDataSet.get(nodeId);
            if (!clickedNodeDetails) return;
            const groupToHighlight = clickedNodeDetails.group;
            const nodeUpdates = [];
            allNodesDataSet.forEach(node => {
                if (node.group === groupToHighlight) {
                    nodeUpdates.push({
                        id: node.id,
                        color: { background: node.originalColorObject.background, border: nodeHighlightBorderColor },
                        borderWidth: nodeHighlightBorderWidth
                    });
                }
            });
            if (nodeUpdates.length > 0) allNodesDataSet.update(nodeUpdates);
        } else if (params.edges.length > 0) {
            const clickedEdgeId = params.edges[0];
            const clickedEdgeData = allEdgesDataSet.get(clickedEdgeId);
            if (clickedEdgeData && !clickedEdgeData.hidden) {
                const sentimentToHighlight = clickedEdgeData.sentiment;
                const colorOfSentiment = clickedEdgeData.baseColor;
                const edgeUpdates = [];
                const nodesToColor = new Set();
                allEdgesDataSet.get({
                    filter: item => item.id && typeof item.id === 'string' && item.id.startsWith('oe-')
                }).forEach(edgeInLoop => {
                    if (edgeInLoop.sentiment === sentimentToHighlight) {
                        const hoverFontSize = Math.min(calculateEdgeFontSize(edgeInLoop.strength) + 3, maxEdgeLabelSize + 2);
                        edgeUpdates.push({ id: edgeInLoop.id, width: edgeInLoop.originalWidth * 1.8, font: { ...edgeInLoop.font, size: hoverFontSize } });
                        nodesToColor.add(edgeInLoop.from);
                        nodesToColor.add(edgeInLoop.to);
                    }
                });
                if (edgeUpdates.length > 0) allEdgesDataSet.update(edgeUpdates);

                const nodeUpdates = [];
                nodesToColor.forEach(nodeIdToColor => {
                    const node = allNodesDataSet.get(nodeIdToColor);
                    if (node) {
                        nodeUpdates.push({
                            id: nodeIdToColor,
                            color: { background: colorOfSentiment, border: node.originalColorObject.border },
                            borderWidth: nodeDefaultBorderWidth
                        });
                    }
                });
                if (nodeUpdates.length > 0) allNodesDataSet.update(nodeUpdates);
            }
        }
    });

    // HOVER EVENT LISTENERS for Hover Info Panel
    network.on("hoverNode", function (params) {
        const nodeId = params.node;
        const nodeData = allNodesDataSet.get(nodeId);
        if (nodeData) {
            updateHoverInfoPanel(nodeData, 'node');
        }
    });

    network.on("blurNode", function (params) {
        updateHoverInfoPanel(null);
    });

    network.on("hoverEdge", function (params) {
        const edgeId = params.edge;
        const edgeData = allEdgesDataSet.get(edgeId);
        if (edgeData && !edgeData.hidden) {
            updateHoverInfoPanel(edgeData, 'edge');
        } else if (edgeData && edgeData.hidden) {
            updateHoverInfoPanel(null);
        }
    });

    network.on("blurEdge", function (params) {
        updateHoverInfoPanel(null);
    });

    window.addEventListener('resize', function() { if (network) network.fit(); });
}

// Main function to initialize everything
async function main() {
    try {
        const response = await fetch('clean_movie_database.yaml');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} while fetching clean_movie_database.yaml`);
        }
        const yamlText = await response.text();
        allMoviesDataFromYaml = jsyaml.load(yamlText);

        processAllDataFromYaml();
        populateMovieSelector();

        const initialMovie = document.getElementById('movieSelector').value;
        if (initialMovie && initialMovie !== "No movies available") {
            updateNetworkForMovie(initialMovie);
        } else if (initialMovie === "No movies available") {
            console.log("No movies available to display.");
            const container = document.getElementById('mynetwork');
            if (container) {
                container.innerHTML = `<p style="color:#abb2bf; text-align:center; padding: 20px;">No movies available in the database.</p>`;
            }
            updateLegend(); // Update legend (will show sentiment part)
            updateHoverInfoPanel(null); // Ensure hover panel is also cleared or shows placeholder
        }

        console.log("Script fully loaded with YAML data and movie selector. Using HTML element titles for dynamic tooltip backgrounds.");

    } catch (error) {
        console.error("Failed to load or process YAML data:", error);
        const container = document.getElementById('mynetwork');
        if (container) {
            container.innerHTML = `<p style="color:red; text-align:center; padding: 20px;">Error loading movie data: ${error.message}.<br>Please ensure 'clean_movie_database.yaml' is in the same folder and check the console for more details.</p>`;
        }
    }
}

main();