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
 * Check if a point is within XZ bounds
 */
const isWithinXZBounds = (point, bounds) => {
  return (
    point[0] >= bounds.minX &&
    point[0] <= bounds.maxX &&
    point[2] >= bounds.minZ &&
    point[2] <= bounds.maxZ
  );
};

/*
 * Create a rectangular pillar extending in Y direction
 */
const createYPillar = (center, deltaY, xSize = EPS * 2, zSize = EPS * 2) => {
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
 * Faces with Y-component normals are extruded only in Y direction
 * Edges get rectangular pillars extending in Y
 * Vertices get small rectangular pillars extending in Y
 * All expansion is constrained to stay within original XZ bounds
 */
const expandDirectional = (options, geometry) => {
  const defaults = {
    delta: 1,
    expandUp: true, // Expand in +Y direction
    expandDown: false, // Expand in -Y direction
  };
  const { delta, expandUp, expandDown } = Object.assign({}, defaults, options);

  let result = geom3.create();
  const edges2planes = new Map();
  const vertices2planes = new Map();
  const xzBounds = getXZBounds(geometry);

  // Calculate actual Y expansion amount
  const deltaY = delta * ((expandUp ? 1 : 0) + (expandDown ? 1 : 0));
  const yOffset = expandUp && expandDown ? 0 : expandUp ? delta : -delta;

  const polygons = geom3.toPolygons(geometry);

  polygons.forEach((polygon) => {
    const plane = poly3.plane(polygon);
    const normal = plane;

    // Only extrude faces that have significant Y component in their normal
    if (Math.abs(normal[1]) > 0.1) {
      // Create extrusion vector only in Y direction
      const yComponent = normal[1] > 0 ? 1 : -1;
      let extrudeY = 0;

      if (expandUp && yComponent > 0) extrudeY += delta;
      if (expandDown && yComponent < 0) extrudeY -= delta;

      if (Math.abs(extrudeY) > EPS) {
        const extrudevector = [0, extrudeY * 2, 0]; // Double for full thickness
        const translatedpolygon = poly3.transform(
          mat4.fromTranslation(mat4.create(), [0, -extrudeY, 0]),
          polygon,
        );
        const extrudedface = extrudePolygon(extrudevector, translatedpolygon);
        result = unionGeom3Sub(result, extrudedface);
      }
    }

    // Collect edges and vertices for later processing
    const vertices = polygon.vertices;
    for (let i = 0; i < vertices.length; i++) {
      mapPlaneToVertex(vertices2planes, vertices[i], plane);
      const j = (i + 1) % vertices.length;
      const edge = [vertices[i], vertices[j]];
      mapPlaneToEdge(edges2planes, edge, plane);
    }
  });

  // Create rectangular pillars for edges instead of cylinders
  edges2planes.forEach((item) => {
    const edge = item[0];
    const planes = item[1];
    const startpoint = edge[0];
    const endpoint = edge[1];

    // Calculate edge midpoint
    const midpoint = [
      (startpoint[0] + endpoint[0]) / 2,
      (startpoint[1] + endpoint[1]) / 2,
      (startpoint[2] + endpoint[2]) / 2,
    ];

    // Check if edge midpoint is within XZ bounds
    if (isWithinXZBounds(midpoint, xzBounds)) {
      // Create a thin rectangular pillar along the edge
      const edgeLength = vec3.distance(startpoint, endpoint);
      const edgeDir = vec3.normalize(
        vec3.create(),
        vec3.subtract(vec3.create(), endpoint, startpoint),
      );

      // Determine pillar dimensions based on edge orientation
      const xSize = Math.abs(edgeDir[0]) > 0.5 ? edgeLength : EPS * 4;
      const zSize = Math.abs(edgeDir[2]) > 0.5 ? edgeLength : EPS * 4;

      const pillar = createYPillar(
        [midpoint[0], midpoint[1] + yOffset, midpoint[2]],
        deltaY / 2,
        xSize,
        zSize,
      );
      result = unionGeom3Sub(result, pillar);
    }
  });

  // Create small rectangular pillars for vertices instead of spheres
  vertices2planes.forEach((item) => {
    const vertex = item[0];
    const planes = item[1];

    // Check if vertex is within XZ bounds
    if (isWithinXZBounds(vertex, xzBounds)) {
      // Create a small rectangular pillar at the vertex
      const pillar = createYPillar(
        [vertex[0], vertex[1] + yOffset, vertex[2]],
        deltaY / 2,
      );
      result = unionGeom3Sub(result, pillar);
    }
  });

  return retessellate(result);
};

module.exports = expandDirectional;
