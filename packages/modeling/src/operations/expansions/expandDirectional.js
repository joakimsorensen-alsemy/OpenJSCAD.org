const vec3 = require("../../maths/vec3");
const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

/**
 * Expand a 3D mesh in one direction only
 * @param {Object} options - Options object
 * @param {Number} options.delta - Distance to expand (can be negative)
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

  const polygons = geom3.toPolygons(geometry);
  const allPolygons = [];

  // Add original top surface
  allPolygons.push(...polygons);

  // Create bottom surface (translated and flipped)
  const bottomPolygons = polygons.map((polygon) => {
    const newVertices = polygon.vertices
      .map((vertex) => vec3.add(vec3.create(), vertex, directionVector))
      .reverse(); // Reverse for correct outward normal
    return poly3.create(newVertices);
  });
  allPolygons.push(...bottomPolygons);

  // Find all boundary edges and create connecting walls
  const edgeMap = new Map();

  // Count how many times each edge appears
  polygons.forEach((polygon) => {
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];

      const edgeKey = createEdgeKey(v1, v2);
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, { edge: [v1, v2], count: 1 });
      } else {
        edgeMap.get(edgeKey).count++;
      }
    }
  });

  // Create walls for boundary edges (edges that appear only once)
  edgeMap.forEach((edgeInfo) => {
    if (edgeInfo.count === 1) {
      // Boundary edge
      const [v1, v2] = edgeInfo.edge;

      // Create translated vertices
      const v1_translated = vec3.add(vec3.create(), v1, directionVector);
      const v2_translated = vec3.add(vec3.create(), v2, directionVector);

      // Create connecting wall with correct winding for outward normal
      const wallQuad = poly3.create([
        v1, // original vertex 1
        v1_translated, // translated vertex 1
        v2_translated, // translated vertex 2
        v2, // original vertex 2
      ]);

      allPolygons.push(wallQuad);
    }
  });

  return geom3.create(allPolygons);
};

/**
 * Create a consistent edge key regardless of vertex order
 */
const createEdgeKey = (v1, v2) => {
  const key1 = `${v1[0].toFixed(6)},${v1[1].toFixed(6)},${v1[2].toFixed(6)}`;
  const key2 = `${v2[0].toFixed(6)},${v2[1].toFixed(6)},${v2[2].toFixed(6)}`;
  return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
};

module.exports = expandDirectional;
