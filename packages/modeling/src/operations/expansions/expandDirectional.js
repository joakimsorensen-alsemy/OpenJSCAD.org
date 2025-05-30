const { EPS, TAU } = require("../../maths/constants");

const mat4 = require("../../maths/mat4");
const vec3 = require("../../maths/vec3");

const fnNumberSort = require("../../utils/fnNumberSort");

const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

const retessellate = require("../modifiers/retessellate");
const unionGeom3Sub = require("../booleans/unionGeom3Sub");
const extrudePolygon = require("./extrudePolygon");

/*
 * Collect all edges and their adjacent planes
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

/*
 * Collect all vertices and their adjacent planes
 */
const mapPlaneToVertex = (map, vertex, plane) => {
  const key = vertex.toString();
  if (!map.has(key)) {
    const entry = [vertex, [plane]];
    map.set(key, entry);
  } else {
    const planes = map.get(key)[1];
    planes.push(plane);
  }
};

/*
 * Get the XZ bounds of the original geometry
 */
const getXZBounds = (geometry) => {
  const polygons = geom3.toPolygons(geometry);
  let minX = Infinity,
    maxX = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  polygons.forEach((polygon) => {
    polygon.vertices.forEach((vertex) => {
      minX = Math.min(minX, vertex[0]);
      maxX = Math.max(maxX, vertex[0]);
      minZ = Math.min(minZ, vertex[2]);
      maxZ = Math.max(maxZ, vertex[2]);
    });
  });

  return { minX, maxX, minZ, maxZ };
};

/*
 * Create a Y-direction expansion of a polygon face
 */
const extrudePolygonYDirection = (polygon, deltaY) => {
  const vertices = polygon.vertices;
  const polygons = [];

  // Create bottom and top faces
  const bottomVertices = vertices.map((v) => [v[0], v[1] - deltaY, v[2]]);
  const topVertices = vertices.map((v) => [v[0], v[1] + deltaY, v[2]]);

  // Add original polygon and its Y-displaced copies
  polygons.push(poly3.create(bottomVertices.slice().reverse())); // Bottom face (reversed for correct normal)
  polygons.push(poly3.create(topVertices)); // Top face

  // Create side faces connecting bottom to top
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const sidePolygon = poly3.create([
      bottomVertices[i],
      bottomVertices[j],
      topVertices[j],
      topVertices[i],
    ]);
    polygons.push(sidePolygon);
  }

  return geom3.create(polygons);
};

/*
 * Create a rectangular pillar extending in Y direction
 */
const createYPillar = (center, deltaY, xSize = EPS * 10, zSize = EPS * 10) => {
  const halfX = xSize / 2;
  const halfZ = zSize / 2;

  // Create 8 vertices of the rectangular pillar
  const vertices = [
    // Bottom face
    [center[0] - halfX, center[1] - deltaY, center[2] - halfZ],
    [center[0] + halfX, center[1] - deltaY, center[2] - halfZ],
    [center[0] + halfX, center[1] - deltaY, center[2] + halfZ],
    [center[0] - halfX, center[1] - deltaY, center[2] + halfZ],
    // Top face
    [center[0] - halfX, center[1] + deltaY, center[2] - halfZ],
    [center[0] + halfX, center[1] + deltaY, center[2] - halfZ],
    [center[0] + halfX, center[1] + deltaY, center[2] + halfZ],
    [center[0] - halfX, center[1] + deltaY, center[2] + halfZ],
  ];

  // Create faces
  const polygons = [
    // Bottom face (0,1,2,3)
    poly3.create([vertices[0], vertices[3], vertices[2], vertices[1]]),
    // Top face (4,5,6,7)
    poly3.create([vertices[4], vertices[5], vertices[6], vertices[7]]),
    // Side faces
    poly3.create([vertices[0], vertices[1], vertices[5], vertices[4]]),
    poly3.create([vertices[1], vertices[2], vertices[6], vertices[5]]),
    poly3.create([vertices[2], vertices[3], vertices[7], vertices[6]]),
    poly3.create([vertices[3], vertices[0], vertices[4], vertices[7]]),
  ];

  return geom3.create(polygons);
};

/*
 * Create the expanded shell of the solid in Y direction only:
 * All faces are given Y-direction thickness
 * Rectangular pillars are added at edges and vertices
 * All expansion stays within original XZ bounds
 */
const expandDirectional = (options, geometry) => {
  const defaults = {
    delta: 1,
  };
  const { delta } = Object.assign({}, defaults, options);

  // Start with the original geometry
  let result = geom3.clone(geometry);

  const edges2planes = new Map();
  const vertices2planes = new Map();
  const xzBounds = getXZBounds(geometry);

  // Expand bounds slightly to include edge cases
  const expandedBounds = {
    minX: xzBounds.minX - EPS,
    maxX: xzBounds.maxX + EPS,
    minZ: xzBounds.minZ - EPS,
    maxZ: xzBounds.maxZ + EPS,
  };

  const polygons = geom3.toPolygons(geometry);

  // Process each face - add Y-direction thickness to all faces
  polygons.forEach((polygon) => {
    const plane = poly3.plane(polygon);

    // Add Y-direction extrusion for every face
    const extrudedFace = extrudePolygonYDirection(polygon, delta);
    result = unionGeom3Sub(result, extrudedFace);

    // Collect edges and vertices for later processing
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      mapPlaneToVertex(vertices2planes, vertices[i], plane);
      const j = (i + 1) % vertices.length;
      const edge = [vertices[i], vertices[j]];
      mapPlaneToEdge(edges2planes, edge, plane);
    }
  });

  // Add rectangular pillars for edges that stay within XZ bounds
  edges2planes.forEach((item) => {
    const edge = item[0];
    const startpoint = edge[0];
    const endpoint = edge[1];

    // Calculate edge midpoint and direction
    const midpoint = [
      (startpoint[0] + endpoint[0]) / 2,
      (startpoint[1] + endpoint[1]) / 2,
      (startpoint[2] + endpoint[2]) / 2,
    ];

    // Check if edge is within XZ bounds
    const withinBounds =
      midpoint[0] >= expandedBounds.minX &&
      midpoint[0] <= expandedBounds.maxX &&
      midpoint[2] >= expandedBounds.minZ &&
      midpoint[2] <= expandedBounds.maxZ;

    if (withinBounds) {
      const edgeVector = vec3.subtract(vec3.create(), endpoint, startpoint);
      const edgeLength = vec3.length(edgeVector);

      // Create pillar with appropriate size
      const pillarSize = Math.max(delta * 0.1, EPS * 20);
      const pillar = createYPillar(midpoint, delta, pillarSize, pillarSize);
      result = unionGeom3Sub(result, pillar);
    }
  });

  // Add small rectangular pillars for vertices that stay within XZ bounds
  vertices2planes.forEach((item) => {
    const vertex = item[0];

    // Check if vertex is within XZ bounds
    const withinBounds =
      vertex[0] >= expandedBounds.minX &&
      vertex[0] <= expandedBounds.maxX &&
      vertex[2] >= expandedBounds.minZ &&
      vertex[2] <= expandedBounds.maxZ;

    if (withinBounds) {
      const pillarSize = Math.max(delta * 0.05, EPS * 10);
      const pillar = createYPillar(vertex, delta, pillarSize, pillarSize);
      result = unionGeom3Sub(result, pillar);
    }
  });

  return retessellate(result);
};

module.exports = expandDirectional;
