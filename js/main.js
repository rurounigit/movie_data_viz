// js/main.js
import * as config from './config.js';
import * as utils from './utils.js';
import * as dataProc from './dataProcessor.js';
import * as netMgr from './networkManager.js';
import * as ui from './uiUpdater.js';
import *  as plotHighlight from './plotHighlighter.js';

function handleNodeHover(nodeData) {
    ui.updateHoverInfoPanel(nodeData, 'node', netMgr.getNodesDataSet());
    if (nodeData && nodeData.group) {
        ui.highlightLegendItemGroup(nodeData.group, 'hovered');
    }
}

function handleNodeBlur(nodeId) { // nodeId might be useful if a specific node was blurred
    ui.updateHoverInfoPanel(null, null, netMgr.getNodesDataSet());
    // Clear 'hovered' from legend items, but preserve 'selected'
    const legendContainer = document.getElementById('legend');
    if (!legendContainer) return;
    const items = legendContainer.querySelectorAll('.legend-item.hovered');
    items.forEach(item => {
        if (!item.classList.contains('selected')) { // Only remove 'hovered' if not also 'selected'
            item.classList.remove('hovered');
        }
    });
     // If a specific node was blurred, get its group to remove its specific hover
    if (nodeId) {
        const node = netMgr.getNodesDataSet().get(nodeId);
        if (node && node.group) {
            const legendItem = legendContainer.querySelector(`.legend-item[data-group-name="${node.group}"]`);
            if (legendItem && !legendItem.classList.contains('selected')) {
                legendItem.classList.remove('hovered');
            }
        }
    }
}


function handleEdgeHover(edgeData) {
    if (edgeData) ui.updateHoverInfoPanel(edgeData, 'edge', netMgr.getNodesDataSet());
    else ui.updateHoverInfoPanel(null, null, netMgr.getNodesDataSet());
}

function handleEdgeBlur() {
    ui.updateHoverInfoPanel(null, null, netMgr.getNodesDataSet());
}

function handleNetworkClick(params, nodesDataSet, edgesDataSet, resetHighlightsFn) {
    resetHighlightsFn(); // This calls netMgr.resetAllHighlights() which now calls ui.clearLegendHighlights()

    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];
        const node = nodesDataSet.get(clickedNodeId);
        if (!node) return;
        const groupToHighlight = node.group;
        const nodeUpdates = [];
        nodesDataSet.forEach(n_forEach => {
            if (n_forEach.group === groupToHighlight) {
                nodeUpdates.push({
                    id: n_forEach.id,
                    color: { background: n_forEach.originalColorObject.background, border: config.nodeHighlightBorderColor },
                    borderWidth: config.nodeHighlightBorderWidth
                });
            }
        });
        if (nodeUpdates.length > 0) nodesDataSet.update(nodeUpdates);
        ui.highlightLegendItemGroup(groupToHighlight, 'selected');

    } else if (params.edges.length > 0) {
        const clickedEdgeId = params.edges[0];
        const edge = edgesDataSet.get(clickedEdgeId);
        if (edge && !edge.hidden) {
            const sentimentToHighlight = edge.sentiment;
            const highlightColorForNodes = edge.baseColor;
            const edgeUpdates = [];
            const nodesToUpdateSet = new Set();
            edgesDataSet.get({ filter: item => item.id && typeof item.id === 'string' && item.id.startsWith('oe-') })
                .forEach(e_i => {
                    if (e_i.sentiment === sentimentToHighlight) {
                        const highlightedFontSize = Math.min(utils.calculateEdgeFontSize(e_i.strength) + 3, config.maxEdgeLabelSize + 2);
                        edgeUpdates.push({
                            id: e_i.id, width: e_i.originalWidth * 1.8,
                            font: { ...e_i.font, size: highlightedFontSize }});
                        nodesToUpdateSet.add(e_i.from); nodesToUpdateSet.add(e_i.to);
                    }
                });
            if (edgeUpdates.length > 0) edgesDataSet.update(edgeUpdates);
            const nodeUpdates = [];
            nodesToUpdateSet.forEach(nodeId => {
                const n_related = nodesDataSet.get(nodeId);
                if (n_related) {
                    nodeUpdates.push({
                        id: nodeId,
                        color: { background: highlightColorForNodes, border: n_related.originalColorObject.border },
                        borderWidth: config.nodeDefaultBorderWidth });
                }
            });
            if (nodeUpdates.length > 0) nodesDataSet.update(nodeUpdates);
        }
    } else {
        // Click on empty canvas - resetHighlightsFn() already took care of clearing network and legend.
    }
}

function handlePlotHighlightRequest(characterName) {
    const rawPlot = netMgr.getCurrentRawPlot();
    const formattedPlot = netMgr.getCurrentFormattedPlot();
    plotHighlight.highlightCharacterInPlot(rawPlot, characterName, formattedPlot, ui.displayPlotInPanel);
}

function handleLegendItemGroupClick(groupName) {
    console.log("Legend group clicked:", groupName);
    netMgr.selectAndHighlightGroup(groupName);
}

function handleLegendItemGroupHover(groupName, isHovering) {
    // console.log("Legend group hover:", groupName, isHovering);
    // Style the legend item itself for hover feedback
    const legendItem = document.querySelector(`#legend .legend-item[data-group-name="${groupName}"]`);
    if (legendItem) {
        if (isHovering) {
            if (!legendItem.classList.contains('selected')) { // Don't add 'hovered-by-legend' if it's already selected
                legendItem.classList.add('hovered-by-legend');
            }
        } else {
            legendItem.classList.remove('hovered-by-legend');
        }
    }
    // Optionally, also highlight nodes in the network
    netMgr.highlightNodesByGroup(groupName, isHovering);
}

function handleLegendItemGroupBlur(groupName) { // Called on mouseleave from legend item
    // console.log("Legend group blur:", groupName);
    const legendItem = document.querySelector(`#legend .legend-item[data-group-name="${groupName}"]`);
    if (legendItem && !legendItem.classList.contains('selected')) { // Only remove hover if not selected
        legendItem.classList.remove('hovered-by-legend');
        legendItem.classList.remove('hovered'); // Also remove general hover if applicable
    }
    // Reset nodes that were highlighted by legend hover, unless the group is selected
    netMgr.highlightNodesByGroup(groupName, false); // 'false' indicates un-highlight
}


function handleMovieChange(selectedMovieTitle) {
    netMgr.updateNetworkForMovie(
        selectedMovieTitle, dataProc.getGlobalNodes(), dataProc.getGlobalEdges(), dataProc.getMoviesData(),
        handleLegendItemGroupClick,
        handleLegendItemGroupHover,
        handleLegendItemGroupBlur // Pass the new blur handler
    );
}

async function startApplication() {
    try {
        await dataProc.loadAndProcessData();
        netMgr.initNetwork(
            'mynetwork', handleNodeHover, handleNodeBlur, handleEdgeHover, handleEdgeBlur, handleNetworkClick, handlePlotHighlightRequest
        );
        const initialMovie = dataProc.populateMovieSelector(handleMovieChange);
        if (initialMovie && initialMovie !== "No movies available") {
             handleMovieChange(initialMovie);
        } else {
            console.warn("No movies available to display after loading data.");
            const networkContainer = document.getElementById('mynetwork');
            if (networkContainer) networkContainer.innerHTML = `<p style="color:#abb2bf; text-align:center; padding:20px;">No movies found.</p>`;
            ui.updateLegend(null, null, handleLegendItemGroupClick, handleLegendItemGroupHover, handleLegendItemGroupBlur); // Update with callbacks
            ui.updateHoverInfoPanel(null, null, null);
            ui.displayPlotInPanel('<p class="info-placeholder">No movie data. Plot unavailable.</p>', false);
        }
        console.log("Application fully loaded and initialized.");
    } catch (error) {
        console.error("FATAL: Failed to initialize application:", error);
        const networkContainer = document.getElementById('mynetwork');
        if (networkContainer) networkContainer.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Error: ${error.message}</p>`;
        ui.updateLegend(null, null, handleLegendItemGroupClick, handleLegendItemGroupHover, handleLegendItemGroupBlur); // Update with callbacks
        ui.updateHoverInfoPanel(null, null, null);
        ui.displayPlotInPanel(`<p class="info-placeholder" style="color:red;">App error: ${error.message}</p>`, false);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApplication);
} else {
    startApplication();
}