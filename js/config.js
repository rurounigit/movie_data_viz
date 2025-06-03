// js/config.js
export const minNodeSize = 10;
export const maxNodeSize = 90;
export const baseSizePerConnection = 10;

export const minNodeLabelSize = 20;
export const maxNodeLabelSize = 44;
export const nodeLabelDegreeScaleFactor = 5;

export const minEdgeLabelSize = 18;
export const maxEdgeLabelSize = 38;
export const edgeLabelStrengthScaleFactor = 2.5;

export const SENTIMENT_COLORS_HEX = ["#2ca02c", "#d62728", "#ff7f0e", "#7f7f7f"];
export const sentimentColors = {
    positive: SENTIMENT_COLORS_HEX[0],
    negative: SENTIMENT_COLORS_HEX[1],
    complicated: SENTIMENT_COLORS_HEX[2],
    neutral: SENTIMENT_COLORS_HEX[3]
};

export const defaultNodeBorderColor = '#3b4048';
export const nodeHighlightBorderColor = '#61afef';
export const nodeHighlightBorderWidth = 3;
export const nodeDefaultBorderWidth = 2;
export const baseNodeFontSizeForReset = 24;
export const baseEdgeFontSizeForReset = 21;

export const IMAGE_BASE_PATH = 'output/character_images/';
export const COMMON_IMAGE_EXTENSIONS = ['.jpg', '.png', '.jpeg', '.webp'];

export const HUE_INCREMENT = 137.508;
export const FIXED_GROUP_SATURATION = 50;
export const FIXED_GROUP_LIGHTNESS = 30;

// Maximum characters for context lookaround in plot highlighting
export const PLOT_HIGHLIGHT_MAX_LOOKAROUND = 200;