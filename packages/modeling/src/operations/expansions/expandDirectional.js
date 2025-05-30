const { EPS, TAU } = require("../../maths/constants");

const mat4 = require("../../maths/mat4");
const vec3 = require("../../maths/vec3");

const geom3 = require("../../geometries/geom3");
const poly3 = require("../../geometries/poly3");

const retessellate = require("../modifiers/retessellate");
const unionGeom3Sub = require("../booleans/unionGeom3Sub");
const extrudePolygon = require("./extrudePolygon");

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
 * Create the expanded shell of the solid in Y direction only:
 * - Faces with Y normals are translated in Y direction
 * - Faces with non-Y normals get Y-direction extrusion
 * - Keep everything within original XZ bounds
 */
const expandDirectional = (options, geometry) => {
  const defaults = {
    delta: 1,
  };
  const { delta } = Object.assign({}, defaults, options);

  const result = [];
  const xzBounds = getXZBounds(geometry);
  const polygons = geom3.toPolygons(geometry);

  polygons.forEach((polygon) => {
    const plane = poly3.plane(polygon);
    const normal = plane;

    // Check if this is primarily a Y-facing face
    const isYFace = Math.abs(normal[1]) > 0.7; // cos(45°) threshold

    if (isYFace) {
      // For Y-facing faces, translate them in Y direction
      const yDirection = normal[1] > 0 ? 1 : -1;
      const translation = [0, yDirection * delta, 0];
      const translatedPolygon = poly3.transform(
        mat4.fromTranslation(mat4.create(), translation),
        polygon,
      );

      // Add both original and translated face
      result.push(polygon);
      result.push(translatedPolygon);

      // Connect them with side walls
      const vertices = polygon.vertices;
      for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        const v1 = vertices[i];
        const v2 = vertices[j];
        const v1_t = [v1[0], v1[1] + translation[1], v1[2]];
        const v2_t = [v2[0], v2[1] + translation[1], v2[2]];

        // Create side wall quad - order vertices for correct normal direction
        let sideWall;
        if (yDirection > 0) {
          sideWall = poly3.create([v1, v2, v2_t, v1_t]);
        } else {
          sideWall = poly3.create([v1, v1_t, v2_t, v2]);
        }
        result.push(sideWall);
      }
    } else {
      // For non-Y-facing faces, add original face plus Y-direction thickness
      result.push(polygon);

      // Create a Y-direction extrusion, but constrain it to XZ bounds
      const vertices = polygon.vertices;

      // Check if all vertices are within XZ bounds
      const allWithinBounds = vertices.every(
        (v) =>
          v[0] >= xzBounds.minX &&
          v[0] <= xzBounds.maxX &&
          v[2] >= xzBounds.minZ &&
          v[2] <= xzBounds.maxZ,
      );

      if (allWithinBounds) {
        // Create top and bottom faces
        const topVertices = vertices.map((v) => [v[0], v[1] + delta, v[2]]);
        const bottomVertices = vertices.map((v) => [v[0], v[1] - delta, v[2]]);

        result.push(poly3.create(topVertices));
        result.push(poly3.create(bottomVertices.slice().reverse()));

        // Create side walls connecting original to top and bottom
        for (let i = 0; i < vertices.length; i++) {
          const j = (i + 1) % vertices.length;
          const v1 = vertices[i];
          const v2 = vertices[j];
          const v1_top = topVertices[i];
          const v2_top = topVertices[j];
          const v1_bottom = bottomVertices[i];
          const v2_bottom = bottomVertices[j];

          // Top side wall
          result.push(poly3.create([v1, v1_top, v2_top, v2]));
          // Bottom side wall
          result.push(poly3.create([v1, v2, v2_bottom, v1_bottom]));
        }
      }
    }
  });

  return retessellate(geom3.create(result));
};

module.exports = expandDirectional;
