const vec3 = require("../../maths/vec3");

const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

const retessellate = require("../modifiers/retessellate");
const unionGeom3Sub = require("../booleans/unionGeom3Sub");

/**
 * Expand a 3D mesh in one direction only
 * Creates a translated copy and connects all boundary edges
 * @param {Object} options - Options object
 * @param {Number} options.delta - Distance to expand
 * @param {String} options.direction - Direction to expand ('y', 'x', or 'z')
 * @param {Object} geometry - Input geometry
 */
const expandDirectional = (options, geometry) => {
  const defaults = {
    delta: 1,
    direction: "y", // 'x', 'y', or 'z'
  };
  const { delta, direction } = Object.assign({}, defaults, options);

  // Create direction vector
  let directionVector;
  switch (direction) {
    case "x":
      directionVector = [delta, 0, 0];
      break;
    case "y":
      directionVector = [0, delta, 0];
      break;
    case "z":
      directionVector = [0, 0, delta];
      break;
    default:
      directionVector = [0, delta, 0]; // default to y
  }

  let result = geom3.create();
  const polygons = geom3.toPolygons(geometry);

  // Add original geometry
  result = unionGeom3Sub(result, geometry);

  // Create translated geometry with flipped normals
  const translatedPolygons = polygons.map((polygon) => {
    const newVertices = polygon.vertices
      .map((vertex) => vec3.add(vec3.create(), vertex, directionVector))
      .reverse(); // Reverse for outward normals
    return poly3.create(newVertices);
  });
  const translatedGeometry = geom3.create(translatedPolygons);
  result = unionGeom3Sub(result, translatedGeometry);

  // Find ALL edges and create connecting walls for boundary edges
  const edgeMap = new Map();

  // Map all edges and count occurrences
  polygons.forEach((polygon) => {
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];

      const edgeKey = createEdgeKey(v1, v2);
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          vertices: [v1, v2],
          count: 1,
          polygons: [polygon],
        });
      } else {
        const edgeInfo = edgeMap.get(edgeKey);
        edgeInfo.count++;
        edgeInfo.polygons.push(polygon);
      }
    }
  });

  // Create walls for ALL boundary edges (edges that appear only once)
  edgeMap.forEach((edgeInfo) => {
    if (edgeInfo.count === 1) {
      // This is a boundary edge
      const [v1, v2] = edgeInfo.vertices;

      // Create translated vertices
      const v1_translated = vec3.add(vec3.create(), v1, directionVector);
      const v2_translated = vec3.add(vec3.create(), v2, directionVector);

      // Create connecting wall with proper winding
      const wallVertices = [v1, v1_translated, v2_translated, v2];
      const wallPolygon = poly3.create(wallVertices);
      const wallGeometry = geom3.create([wallPolygon]);

      result = unionGeom3Sub(result, wallGeometry);
    }
  });

  return retessellate(result);
};

/**
 * Create a consistent edge key regardless of vertex order
 * Uses higher precision to avoid floating point issues
 */
const createEdgeKey = (v1, v2) => {
  const precision = 8; // Higher precision for better accuracy
  const key1 = `${v1[0].toFixed(precision)},${v1[1].toFixed(precision)},${v1[2].toFixed(precision)}`;
  const key2 = `${v2[0].toFixed(precision)},${v2[1].toFixed(precision)},${v2[2].toFixed(precision)}`;
  return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
};

module.exports = expandDirectional;
