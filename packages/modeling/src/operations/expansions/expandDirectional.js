const mat4 = require("../../maths/mat4");
const vec3 = require("../../maths/vec3");
const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");
const unionGeom3Sub = require("../booleans/unionGeom3Sub");

/**
 * Expand a 3D mesh in one direction only (along y-axis)
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

  let result = geom3.create();
  const edges2planes = new Map(); // Track edges and their adjacent faces

  const polygons = geom3.toPolygons(geometry);

  // Add original surface
  result = unionGeom3Sub(result, geometry);

  // Create translated surface
  const translationMatrix = mat4.fromTranslation(
    mat4.create(),
    directionVector,
  );
  const translatedPolygons = polygons.map((polygon) =>
    poly3.transform(translationMatrix, polygon),
  );

  // Reverse normals for translated surface to face outward
  const reversedPolygons = translatedPolygons.map((polygon) => {
    const reversedVertices = [...polygon.vertices].reverse();
    return poly3.create(reversedVertices);
  });

  const translatedGeometry = geom3.create(reversedPolygons);
  result = unionGeom3Sub(result, translatedGeometry);

  // Build edge map to identify boundary edges
  polygons.forEach((polygon) => {
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const edge = [vertices[i], vertices[j]];
      mapPlaneToEdge(edges2planes, edge, poly3.plane(polygon));
    }
  });

  // Create connecting faces for boundary edges only
  edges2planes.forEach((item) => {
    const edge = item[0];
    const planes = item[1];

    // Only create connecting faces for boundary edges (edges with only one adjacent face)
    if (planes.length === 1) {
      const startpoint = edge[0];
      const endpoint = edge[1];

      // Create translated edge points
      const translatedStart = vec3.add(
        vec3.create(),
        startpoint,
        directionVector,
      );
      const translatedEnd = vec3.add(vec3.create(), endpoint, directionVector);

      // Create connecting quad face
      // Order vertices for outward-facing normal
      const connectingFace = poly3.create([
        startpoint,
        endpoint,
        translatedEnd,
        translatedStart,
      ]);

      const connectingGeometry = geom3.create([connectingFace]);
      result = unionGeom3Sub(result, connectingGeometry);
    }
  });

  return result;
};

/**
 * Helper function to map planes to edges (from original code)
 */
const mapPlaneToEdge = (map, edge, plane) => {
  const key0 = edge[0].toString();
  const key1 = edge[1].toString();
  // Sort keys to make edges undirected
  const key = key0 < key1 ? `${key0},${key1}` : `${key1},${key0}`;
  if (!map.has(key)) {
    const entry = [edge, [plane]];
    map.set(key, entry);
  } else {
    const planes = map.get(key)[1];
    planes.push(plane);
  }
};

module.exports = expandDirectional;
