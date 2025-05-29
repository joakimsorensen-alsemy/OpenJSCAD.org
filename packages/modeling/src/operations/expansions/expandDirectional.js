const mat4 = require("../../maths/mat4");
const vec3 = require("../../maths/vec3");
const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

/**
 * Expand a 3D mesh in one direction only
 * Creates a translated copy and connects edges with walls
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

  const polygons = geom3.toPolygons(geometry);
  const allPolygons = [];

  // 1. Add original polygons (top surface)
  polygons.forEach((polygon) => {
    allPolygons.push(polygon);
  });

  // 2. Add translated polygons (bottom surface) with flipped normals
  polygons.forEach((polygon) => {
    const translatedVertices = polygon.vertices.map((vertex) =>
      vec3.add(vec3.create(), vertex, directionVector),
    );
    // Reverse vertex order for correct outward normal
    translatedVertices.reverse();
    const translatedPolygon = poly3.create(translatedVertices);
    allPolygons.push(translatedPolygon);
  });

  // 3. Find boundary edges and create walls only for those
  const edgeMap = new Map();

  // First pass: count edge occurrences
  polygons.forEach((polygon) => {
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];

      const edgeKey = createEdgeKey(v1, v2);
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, { vertices: [v1, v2], count: 1 });
      } else {
        edgeMap.get(edgeKey).count++;
      }
    }
  });

  // Second pass: create walls only for boundary edges
  let wallCount = 0;
  edgeMap.forEach((edgeInfo) => {
    if (edgeInfo.count === 1) {
      // Boundary edge
      const [v1, v2] = edgeInfo.vertices;

      // Create translated vertices
      const v1_translated = vec3.add(vec3.create(), v1, directionVector);
      const v2_translated = vec3.add(vec3.create(), v2, directionVector);

      // Create wall quad - order matters for correct normal direction
      const wallVertices = [
        v1, // original start
        v2, // original end
        v2_translated, // translated end
        v1_translated, // translated start
      ];

      const wallPolygon = poly3.create(wallVertices);
      allPolygons.push(wallPolygon);
      wallCount++;
    }
  });

  console.log(`Created ${allPolygons.length} polygons total`);
  console.log(
    `Original: ${polygons.length}, Translated: ${polygons.length}, Boundary walls: ${wallCount}`,
  );

  return geom3.create(allPolygons);
};

/**
 * Create a consistent edge key regardless of vertex order
 */
const createEdgeKey = (v1, v2) => {
  const precision = 6;
  const key1 = `${v1[0].toFixed(precision)},${v1[1].toFixed(precision)},${v1[2].toFixed(precision)}`;
  const key2 = `${v2[0].toFixed(precision)},${v2[1].toFixed(precision)},${v2[2].toFixed(precision)}`;
  return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
};

module.exports = expandDirectional;
