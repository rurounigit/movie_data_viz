// js/networkManager.js
// Assuming vis is globally available from <script src="...vis-network.min.js"></script>

import * as config from './config.js';
import * as utils from './utils.js';
import * as ui from './uiUpdater.js';

let network = null;
let allNodesDataSet = new vis.DataSet();
let allEdgesDataSet = new vis.DataSet();
let physicsStopTimeout;

let rawCurrentMoviePlot = '';
let formattedOriginalPlotHTML = '<p class="info-placeholder">Plot summary will appear here once a movie is selected.</p>';

function generateHelperEdges(nodesForClustering) {
    const helperEdges = [];
    const groups = {};
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

function _createVisNode(masterNode, nodeDegrees) {
    const degree = nodeDegrees[masterNode.id] || 0;
    let size = Math.min(config.minNodeSize + (degree * config.baseSizePerConnection), config.maxNodeSize);
    const group = masterNode.rawGroup;
    const baseColor = utils.generateAndCacheGroupColor(group);
    const dynamicNodeFontSize = utils.calculateNodeFontSize(degree);
    return {
        id: masterNode.id, label: masterNode.label, group: group, actor_name: masterNode.actor_name,
        title: utils.createTooltipElement(masterNode.tooltipTextData, baseColor), rawTooltipData: masterNode.tooltipTextData,
        movieTitle: masterNode.movieTitle, tmdb_person_id: masterNode.tmdb_person_id, size: size, shape: 'dot',
        color: { background: baseColor, border: config.defaultNodeBorderColor, highlight: { background: baseColor, border: config.nodeHighlightBorderColor }, hover: { background: baseColor, border: config.nodeHighlightBorderColor }},
        originalColorObject: { background: baseColor, border: config.defaultNodeBorderColor }, borderWidth: config.nodeDefaultBorderWidth,
        font: { size: dynamicNodeFontSize, color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40, 44, 52, 0.7)', strokeWidth: 0 },
        degree: degree
    };
}

function _createVisEdge(masterEdge, edgeVisIdCounter) {
    const dynamicEdgeFontSize = utils.calculateEdgeFontSize(masterEdge.rawStrength);
    return {
        id: `oe-${masterEdge.from}-${masterEdge.to}-${edgeVisIdCounter}`, from: masterEdge.from, to: masterEdge.to,
        label: masterEdge.rawLabel, title: utils.createTooltipElement(masterEdge.tooltipTextData, masterEdge.rawBaseColor),
        rawTooltipData: masterEdge.tooltipTextData, movieTitle: masterEdge.movieTitle,
        width: utils.getEdgeWidth(masterEdge.rawStrength), originalWidth: utils.getEdgeWidth(masterEdge.rawStrength),
        color: { color: masterEdge.rawBaseColor, highlight: masterEdge.rawBaseColor, hover: masterEdge.rawBaseColor },
        baseColor: masterEdge.rawBaseColor, arrows: masterEdge.rawArrows, sentiment: masterEdge.rawSentiment,
        font: { size: dynamicEdgeFontSize, color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40, 44, 52, 0.7)', strokeWidth: 0, align: 'middle' },
        strength: masterEdge.rawStrength
    };
}

export function updateNetworkForMovie(selectedMovieTitle, globalNodes, globalEdges, allMovieData) {
    console.log(`Updating network for: ${selectedMovieTitle}`);
    let currentNodesFromMaster = [];
    let currentEdgesFromMaster = [];
    const selectedMovieData = allMovieData.find(movie => movie.movie_title === selectedMovieTitle);

    if (selectedMovieTitle && selectedMovieTitle !== "No movies available") {
        if (selectedMovieData) {
            currentNodesFromMaster = globalNodes.filter(node => node.movieTitle === selectedMovieTitle);
            const currentNodeIds = new Set(currentNodesFromMaster.map(n => n.id));
            currentEdgesFromMaster = globalEdges.filter(edge =>
                edge.movieTitle === selectedMovieTitle &&
                currentNodeIds.has(edge.from) &&
                currentNodeIds.has(edge.to)
            );
            rawCurrentMoviePlot = selectedMovieData.plot_with_character_constraints_and_relations || '';
            formattedOriginalPlotHTML = rawCurrentMoviePlot
                ? utils.htmlEscape(rawCurrentMoviePlot).replace(/\n/g, "<br>")
                : '<p class="info-placeholder">Plot summary not available for this movie.</p>';
        } else {
            rawCurrentMoviePlot = '';
            formattedOriginalPlotHTML = `<p class="info-placeholder" style="color: #ffcc00;">Plot data missing for "${selectedMovieTitle}".</p>`;
            console.warn(`Data for movie "${selectedMovieTitle}" not found.`);
        }
    } else {
        rawCurrentMoviePlot = '';
        formattedOriginalPlotHTML = selectedMovieTitle === "No movies available"
            ? '<p class="info-placeholder">No movies available.</p>'
            : '<p class="info-placeholder">Select a movie.</p>';
    }
    ui.displayPlotInPanel(formattedOriginalPlotHTML, false);

    const nodeDegrees = {};
    currentNodesFromMaster.forEach(node => { nodeDegrees[node.id] = 0; });
    currentEdgesFromMaster.forEach(edge => {
        nodeDegrees[edge.from] = (nodeDegrees[edge.from] || 0) + 1;
        nodeDegrees[edge.to] = (nodeDegrees[edge.to] || 0) + 1;
    });

    const processedNodes = currentNodesFromMaster.map(masterNode => _createVisNode(masterNode, nodeDegrees));
    let edgeVisIdCounter = 0;
    const processedEdges = currentEdgesFromMaster.map(masterEdge => _createVisEdge(masterEdge, edgeVisIdCounter++));
    const helperClusteringEdges = generateHelperEdges(processedNodes);

    if (!network) {
        console.error("Network not initialized. updateNetworkForMovie should only be called after initNetwork.");
        return;
    }

    allNodesDataSet.clear();
    allEdgesDataSet.clear();
    allNodesDataSet.add(processedNodes);
    allEdgesDataSet.add(processedEdges);
    allEdgesDataSet.add(helperClusteringEdges);

    network.setOptions({ physics: { enabled: processedNodes.length > 0 } });

    // Re-introduced explicit stabilize call from original script for updates
    if (processedNodes.length > 0) {
        console.log("Forcing stabilization on update as per original script logic.");
        network.stabilize(1500);
    }

    clearTimeout(physicsStopTimeout);
    if (processedNodes.length > 0) {
        physicsStopTimeout = setTimeout(stopPhysics, processedNodes.length > 100 ? 20000 : 10000);
        if (network) network.fit();
    } else {
        stopPhysics();
    }

    ui.updateLegend(allNodesDataSet, allEdgesDataSet);
    ui.updateHoverInfoPanel(null, null, allNodesDataSet);
}

export function stopPhysics() {
    if (network && network.physics.options.enabled) {
        network.setOptions({ physics: false });
        console.log("Physics stopped.");
    }
}

export function resetAllHighlights() {
    if (!allNodesDataSet || !allEdgesDataSet || !network) return;
    const nodeUpdates = allNodesDataSet.map(n => ({
        id: n.id,
        color: { background: n.originalColorObject.background, border: n.originalColorObject.border },
        borderWidth: config.nodeDefaultBorderWidth,
        font: { ...n.font, size: utils.calculateNodeFontSize(n.degree) }
    }));
    if (nodeUpdates.length > 0) allNodesDataSet.update(nodeUpdates);
    const edgeUpdates = allEdgesDataSet.get({ filter: i => i.id && typeof i.id === 'string' && i.id.startsWith('oe-') })
        .map(e => ({
            id: e.id,
            color: { color: e.baseColor, highlight: e.baseColor, hover: e.baseColor },
            width: e.originalWidth,
            font: { ...e.font, size: utils.calculateEdgeFontSize(e.strength) }
        }));
    if (edgeUpdates.length > 0) allEdgesDataSet.update(edgeUpdates);
}

function _setupNetworkEventListeners(onNodeHoverCb, onNodeBlurCb, onEdgeHoverCb, onEdgeBlurCb, onNetworkClickCb, onPlotHighlightRequestCb) {
    if (!network) return;
    network.on("stabilizationIterationsDone", () => {
        console.log("Stabilization iterations done.");
        clearTimeout(physicsStopTimeout);
        physicsStopTimeout = setTimeout(stopPhysics, 1500);
    });
    network.on("stabilized", (params) => {
        console.log("Network stabilized after " + params.iterations + " iterations.");
        clearTimeout(physicsStopTimeout);
    });
    network.on("click", function (params) {
        onNetworkClickCb(params, allNodesDataSet, allEdgesDataSet, resetAllHighlights);
    });
    network.on("hoverNode", function (params) {
        const nodeData = allNodesDataSet.get(params.node);
        if (nodeData) {
            onNodeHoverCb(nodeData);
            if (onPlotHighlightRequestCb) onPlotHighlightRequestCb(nodeData.label);
        }
    });
    network.on("blurNode", function (params) {
        onNodeBlurCb();
        if (onPlotHighlightRequestCb) onPlotHighlightRequestCb(null);
    });
    network.on("hoverEdge", function (params) {
        const edgeData = allEdgesDataSet.get(params.edge);
        if (edgeData && !edgeData.hidden) onEdgeHoverCb(edgeData);
        else if (edgeData && edgeData.hidden) onEdgeHoverCb(null);
    });
    network.on("blurEdge", function (params) {
        onEdgeBlurCb();
    });
    window.addEventListener('resize', function() { if (network) network.fit(); });
}

export function initNetwork(containerId, onNodeHoverCb, onNodeBlurCb, onEdgeHoverCb, onEdgeBlurCb, onNetworkClickCb, onPlotHighlightRequestCb) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Network container with ID '${containerId}' not found.`);
        return;
    }
    const data = { nodes: allNodesDataSet, edges: allEdgesDataSet };

    const options = {
        nodes: {
            font: { color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40,44,52,0.7)', strokeWidth: 0 },
            scaling: { min: config.minNodeSize, max: config.maxNodeSize, label: { enabled: true, min: config.minNodeLabelSize, max: config.maxNodeLabelSize+4 }},
            shadow: {enabled:true,color:'rgba(0,0,0,0.4)',size:7,x:3,y:3},
            chosen: {
                // Corrected chosen.node function
                node: (values, id, selected, hovering) => {
                    const n = allNodesDataSet.get(id);
                    if (!n) return;

                    if (selected || hovering) {
                        values.borderColor = config.nodeHighlightBorderColor;
                        values.borderWidth = config.nodeHighlightBorderWidth;
                    } else {
                        values.borderColor = n.originalColorObject.border;
                        values.borderWidth = config.nodeDefaultBorderWidth;
                    }
                },
                label:(values,id,selected,hovering)=>{
                    const n=allNodesDataSet.get(id);
                    if(n){
                        const bf=utils.calculateNodeFontSize(n.degree);
                        if(hovering || selected) {
                            values.size=Math.min(bf+4, config.maxNodeLabelSize+2);
                        } else {
                            values.size=bf;
                        }
                    }
                }
            }
        },
        edges: {
            font: { color: '#abb2bf', face: 'Roboto, sans-serif', background: 'rgba(40,44,52,0.7)', strokeWidth: 0, align: 'middle'},
            arrows:{to:{enabled:false}},
            smooth:{enabled:true,type:'dynamic',roundness:0.3},
            chosen:{
                edge:(values,id,selected,hovering)=>{
                    const e=allEdgesDataSet.get(id);
                    if(e&&!e.hidden){
                        if(hovering || selected){
                            values.width=e.originalWidth*1.8;
                        } else{
                            values.width=e.originalWidth;
                        }
                    }
                },
                label:(values,id,selected,hovering)=>{
                    const e=allEdgesDataSet.get(id);
                    if(e&&!e.hidden){
                        const bf=utils.calculateEdgeFontSize(e.strength);
                        if(hovering || selected){
                            values.size=Math.min(bf+3, config.maxEdgeLabelSize+2);
                        } else{
                            values.size=bf;
                        }
                    }
                }
            },
            color:{opacity:0.8}
        },
        physics: {
            enabled:true,solver:'forceAtlas2Based',
            forceAtlas2Based:{gravitationalConstant:-70,centralGravity:0.01,springLength:80,springConstant:0.07,damping:0.5,avoidOverlap:0.15},
            maxVelocity:40,minVelocity:0.1,
            stabilization:{enabled:true,iterations:1500,updateInterval:25,fit:true},
            adaptiveTimestep:true
        },
        interaction:{
            hover:true,hoverConnectedEdges:false,tooltipDelay:200,navigationButtons:true,keyboard:true,
            selectConnectedEdges:false,multiselect:false
        },
        layout: {}
    };

    network = new vis.Network(container, data, options);
    _setupNetworkEventListeners(onNodeHoverCb, onNodeBlurCb, onEdgeHoverCb, onEdgeBlurCb, onNetworkClickCb, onPlotHighlightRequestCb);
}

export const getCurrentRawPlot = () => rawCurrentMoviePlot;
export const getCurrentFormattedPlot = () => formattedOriginalPlotHTML;
export const getNodesDataSet = () => allNodesDataSet;
export const getEdgesDataSet = () => allEdgesDataSet;