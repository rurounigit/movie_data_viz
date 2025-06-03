// js/dataProcessor.js
import * as config from './config.js';
// No utils needed directly here unless some specific utility like slugify was used during initial processing

let allMoviesDataFromYaml = [];
let characterNameToGlobalIdMap = {};
let globallyUniqueNodesMasterList = [];
let globallyUniqueEdgesMasterList = [];

async function fetchRawData() {
    const response = await fetch('clean_movie_database.yaml'); // Assuming this path is correct from HTML's perspective
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} while fetching YAML.`);
    }
    const yamlText = await response.text();
    return jsyaml.load(yamlText); // jsyaml must be globally available (e.g. via script tag)
}

function _processAllDataFromYamlInternal() {
    let globalNodeIdCounter = 0;
    characterNameToGlobalIdMap = {}; // Reset map
    globallyUniqueNodesMasterList = []; // Reset list
    globallyUniqueEdgesMasterList = []; // Reset list

    if (!allMoviesDataFromYaml || !Array.isArray(allMoviesDataFromYaml)) {
        console.error("No movie data or invalid data format from YAML.");
        return;
    }

    allMoviesDataFromYaml.forEach(movie => {
        const movieTitle = movie.movie_title;
        if (!movieTitle) {
            console.warn("Found a movie entry without a title. Skipping.", movie);
            return;
        }

        if (movie.character_list && Array.isArray(movie.character_list)) {
            movie.character_list.forEach(character => {
                if (!character.name) {
                    console.warn(`Character in movie "${movieTitle}" is missing a name. Skipping.`, character);
                    return;
                }
                const globalId = globalNodeIdCounter++;
                const characterKey = `${movieTitle}_${character.name}`; // Unique key per movie
                characterNameToGlobalIdMap[characterKey] = globalId;

                globallyUniqueNodesMasterList.push({
                    id: globalId, // This is the unique ID for vis.js
                    label: character.name, // This will be the visible label
                    actor_name: character.actor_name || 'Unknown Actor',
                    rawGroup: character.group || 'Unknown', // Store the raw group name
                    tooltipTextData: `${character.name || 'Unknown Character'}\n(Played by: ${character.actor_name || 'Unknown Actor'})\n\n${character.description || 'No description available.'}`,
                    movieTitle: movieTitle, // To filter nodes by movie
                    tmdb_person_id: character.tmdb_person_id || null
                });
            });
        }
    });

    allMoviesDataFromYaml.forEach(movie => {
        const movieTitle = movie.movie_title;
        if (!movieTitle) return; // Already warned

        if (movie.relationships && Array.isArray(movie.relationships)) {
            movie.relationships.forEach(rel => {
                if (!rel.source || !rel.target) {
                    console.warn(`Relationship in movie "${movieTitle}" is missing source or target. Skipping.`, rel);
                    return;
                }
                const fromKey = `${movieTitle}_${rel.source}`;
                const toKey = `${movieTitle}_${rel.target}`;
                const fromId = characterNameToGlobalIdMap[fromKey];
                const toId = characterNameToGlobalIdMap[toKey];

                if (fromId !== undefined && toId !== undefined) {
                    globallyUniqueEdgesMasterList.push({
                        from: fromId,
                        to: toId,
                        rawLabel: rel.type || "", // Store raw relationship type
                        rawStrength: rel.strength || 1,
                        tooltipTextData: `${rel.type || 'Relationship'}: ${rel.source} & ${rel.target}\n\n${rel.description || 'No specific details.'}`,
                        rawBaseColor: config.sentimentColors[rel.sentiment] || config.sentimentColors.neutral,
                        rawArrows: { to: { enabled: false } }, // Default, can be overridden by data if needed
                        rawSentiment: rel.sentiment || 'neutral',
                        movieTitle: movieTitle // To filter edges by movie
                    });
                } else {
                    console.warn(`Could not map edge for movie "${movieTitle}": ${rel.source} -> ${rel.target}. One or both characters not found in character_list for this movie.`);
                }
            });
        }
    });
}

export async function loadAndProcessData() {
    try {
        allMoviesDataFromYaml = await fetchRawData();
        _processAllDataFromYamlInternal();
    } catch (error) {
        console.error("Error loading or processing YAML data:", error);
        allMoviesDataFromYaml = []; // Ensure it's an empty array on error
        // Re-throw or handle as appropriate for the main application
        throw error;
    }
}

export function getMoviesData() { return allMoviesDataFromYaml; }
export function getGlobalNodes() { return globallyUniqueNodesMasterList; }
export function getGlobalEdges() { return globallyUniqueEdgesMasterList; }
// getCharacterMap is not explicitly exported as it's an internal detail for _processAllDataFromYamlInternal.
// If needed externally, it could be.

export function populateMovieSelector(onMovieChangeCallback) {
    const selector = document.getElementById('movieSelector');
    if (!selector) {
        console.error("Movie selector element not found.");
        return null;
    }
    selector.innerHTML = ''; // Clear existing options

    const movieTitles = [...new Set(allMoviesDataFromYaml.map(m => m.movie_title))].sort();

    if (movieTitles.length > 0) {
        movieTitles.forEach(title => {
            const option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            selector.appendChild(option);
        });
        selector.value = movieTitles[0]; // Select the first movie by default
        selector.disabled = false;
    } else {
        const option = document.createElement('option');
        option.textContent = "No movies available";
        option.disabled = true;
        selector.appendChild(option);
        selector.disabled = true;
    }

    // Remove previous event listener if any to avoid multiple triggers
    const newSelector = selector.cloneNode(true);
    selector.parentNode.replaceChild(newSelector, selector);

    newSelector.addEventListener('change', (event) => onMovieChangeCallback(event.target.value));

    return movieTitles.length > 0 ? movieTitles[0] : "No movies available";
}