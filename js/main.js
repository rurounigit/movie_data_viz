// js/main.js
// Config might not be directly used here if other modules handle its usage
import * as config from './config.js';
import * as utils from './utils.js'; // For any top-level utilities if needed
import * as dataProc from './dataProcessor.js';
import * as netMgr from './networkManager.js';
import * as ui from './uiUpdater.js';
import *  as plotHighlight from './plotHighlighter.js';

// --- Event Handler Bridge Functions ---
// These functions are called by networkManager's event listeners
// and they, in turn, call functions in uiUpdater or plotHighlighter.

function handleNodeHover(nodeData) {
    // Pass allNodesDataSet from networkManager for context if uiUpdater needs it (e.g., for edge details)
    ui.updateHoverInfoPanel(nodeData, 'node', netMgr.getNodesDataSet());
}

function handleNodeBlur() {
    ui.updateHoverInfoPanel(null, null, netMgr.getNodesDataSet());
}

function handleEdgeHover(edgeData) {
    // edgeData will be null if a hidden edge was "hovered" and filtered out by networkManager
    if (edgeData) {
        ui.updateHoverInfoPanel(edgeData, 'edge', netMgr.getNodesDataSet());
    } else {
        ui.updateHoverInfoPanel(null, null, netMgr.getNodesDataSet());
    }
}

function handleEdgeBlur() {
    ui.updateHoverInfoPanel(null, null, netMgr.getNodesDataSet());
}

function handleNetworkClick(params, nodesDataSet, edgesDataSet, resetHighlightsFn) {
    resetHighlightsFn(); // Call the reset function passed from networkManager

    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];
        const node = nodesDataSet.get(clickedNodeId);
        if (!node) return;

        const groupToHighlight = node.group;
        const nodeUpdates = [];
        nodesDataSet.forEach(n => {
            if (n.group === groupToHighlight) {
                nodeUpdates.push({
                    id: n.id,
                    color: { // Keep original background, highlight border
                        background: n.originalColorObject.background,
                        border: config.nodeHighlightBorderColor
                    },
                    borderWidth: config.nodeHighlightBorderWidth
                });
            }
        });
        if (nodeUpdates.length > 0) nodesDataSet.update(nodeUpdates);

    } else if (params.edges.length > 0) {
        const clickedEdgeId = params.edges[0];
        const edge = edgesDataSet.get(clickedEdgeId);
        if (edge && !edge.hidden) { // Ensure it's a visible edge
            const sentimentToHighlight = edge.sentiment;
            const highlightColorForNodes = edge.baseColor; // Color nodes related to this sentiment with edge's base color
            const edgeUpdates = [];
            const nodesToUpdate = new Set();

            edgesDataSet.get({ filter: item => item.id && typeof item.id === 'string' && item.id.startsWith('oe-') })
                .forEach(e_i => {
                    if (e_i.sentiment === sentimentToHighlight) {
                        const highlightedFontSize = Math.min(utils.calculateEdgeFontSize(e_i.strength) + 3, config.maxEdgeLabelSize + 2);
                        edgeUpdates.push({
                            id: e_i.id,
                            width: e_i.originalWidth * 1.8, // Make selected sentiment edges thicker
                            font: { ...e_i.font, size: highlightedFontSize }
                        });
                        nodesToUpdate.add(e_i.from);
                        nodesToUpdate.add(e_i.to);
                    }
                });
            if (edgeUpdates.length > 0) edgesDataSet.update(edgeUpdates);

            const nodeUpdates = [];
            nodesToUpdate.forEach(nodeId => {
                const n = nodesDataSet.get(nodeId);
                if (n) {
                    nodeUpdates.push({
                        id: nodeId,
                        color: { // Use edge's base color for related nodes
                            background: highlightColorForNodes, // Or keep n.originalColorObject.background
                            border: n.originalColorObject.border // Or config.nodeHighlightBorderColor
                        },
                        // borderWidth: config.nodeHighlightBorderWidth // Optionally highlight border too
                    });
                }
            });
            if (nodeUpdates.length > 0) nodesDataSet.update(nodeUpdates);
        }
    }
}

function handlePlotHighlightRequest(characterName) {
    const rawPlot = netMgr.getCurrentRawPlot();
    const formattedPlot = netMgr.getCurrentFormattedPlot();
    plotHighlight.highlightCharacterInPlot(rawPlot, characterName, formattedPlot, ui.displayPlotInPanel);
}

function handleMovieChange(selectedMovieTitle) {
    netMgr.updateNetworkForMovie(
        selectedMovieTitle,
        dataProc.getGlobalNodes(),
        dataProc.getGlobalEdges(),
        dataProc.getMoviesData()
    );
}

// --- Main Application Setup ---
async function startApplication() {
    try {
        await dataProc.loadAndProcessData();

        netMgr.initNetwork(
            'mynetwork', // ID of the network container div
            handleNodeHover,
            handleNodeBlur,
            handleEdgeHover,
            handleEdgeBlur,
            handleNetworkClick,
            handlePlotHighlightRequest // Callback for plot highlighting requests
        );

        const initialMovie = dataProc.populateMovieSelector(handleMovieChange);

        if (initialMovie && initialMovie !== "No movies available") {
            handleMovieChange(initialMovie); // Load the initially selected movie
        } else {
            console.warn("No movies available to display after loading data.");
            const networkContainer = document.getElementById('mynetwork');
            if (networkContainer) {
                networkContainer.innerHTML = `<p style="color:#abb2bf; text-align:center; padding:20px;">No movies found in the database.</p>`;
            }
            // Initialize UI elements to reflect "no data" state
            ui.updateLegend(null, null);
            ui.updateHoverInfoPanel(null, null, null);
            ui.displayPlotInPanel('<p class="info-placeholder">No movie data loaded. Plot summary unavailable.</p>', false);
        }
        console.log("Application fully loaded and initialized.");

    } catch (error) {
        console.error("FATAL: Failed to initialize application:", error);
        const networkContainer = document.getElementById('mynetwork');
        if (networkContainer) {
            networkContainer.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Error initializing application: ${error.message}</p>`;
        }
        // Update other UI to reflect error state
        ui.updateLegend(null, null);
        ui.updateHoverInfoPanel(null, null, null);
        ui.displayPlotInPanel(`<p class="info-placeholder" style="color:red;">Application error: ${error.message}</p>`, false);
    }
}

// Ensure DOM is ready before trying to get elements, though with script at end of body, it usually is.
// Alternatively, wrap with DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApplication);
} else {
    startApplication();
}

// Reminder for HTML structure:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js"></script>
// <script src="https://visjs.github.io/vis-network/standalone/umd/vis-network.min.js"></script>
// <script type="module" src="js/main.js"></script>