package com.myblog.user.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.myblog.user.dto.TravelRouteWriteRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.TravelRouteStateVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * Persists one user-confirmed driving route per travel. GET recomputes a SHA-256
 * of REAL point IDs, coordinates and order, so moved/removed points invalidate it.
 * No 3D renderer, AMap server key or existing auth class is changed.
 */
@Service
public class TravelRouteSnapshotService {
    private static final int MAX_POINTS = 120;
    private static final int MAX_VERTICES = 100_000;
    private static final int MAX_JSON_BYTES = 5_000_000;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public TravelRouteSnapshotService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    private Map<String, Object> requireAccess(long travelId, long userId, boolean ownerOnly, boolean lock) {
        if (travelId < 1 || userId < 1) throw new BusinessException(404, "Travel not found");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT user_id, visibility, is_published FROM travel_project WHERE id=?" +
                        (lock ? " FOR UPDATE" : ""), travelId);
        if (rows.isEmpty()) throw new BusinessException(404, "Travel not found");
        Map<String, Object> row = rows.get(0);
        boolean owner = ((Number) row.get("user_id")).longValue() == userId;
        if (ownerOnly && !owner) throw new BusinessException(403, "Only the owner can save a route");
        Object publicationState = row.get("is_published");
        boolean published = Boolean.TRUE.equals(publicationState) ||
                (publicationState instanceof Number && ((Number) publicationState).intValue() == 1);
        if (!owner && !(published && "PUBLIC".equals(row.get("visibility")))) {
            throw new BusinessException(404, "Travel not found or inaccessible");
        }
        return row;
    }

    private List<Map<String, Object>> currentPoints(long travelId) {
        return jdbc.queryForList(
                "SELECT id, sort_order, longitude, latitude FROM travel_point " +
                        "WHERE travel_id=? AND point_type='REAL' ORDER BY sort_order, id LIMIT 121", travelId);
    }

    /** Digest is computed by the server; never trust a hash authored by the browser. */
    private String signature(List<Map<String, Object>> points) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (Map<String, Object> row : points) {
                String part = ((Number) row.get("id")).longValue() + "," +
                        ((Number) row.get("sort_order")).intValue() + "," +
                        Double.toString(((Number) row.get("longitude")).doubleValue()) + "," +
                        Double.toString(((Number) row.get("latitude")).doubleValue()) + "\n";
                digest.update(part.getBytes(StandardCharsets.UTF_8));
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    public TravelRouteStateVO read(Long travelId, Long userId) {
        requireAccess(travelId, userId, false, false);
        List<Map<String, Object>> points = currentPoints(travelId);
        String pointSignature = signature(points);
        List<Map<String, Object>> records = jdbc.queryForList(
                "SELECT revision, point_signature, route_json FROM travel_route_snapshot WHERE travel_id=?", travelId);
        if (records.isEmpty()) return new TravelRouteStateVO(0, pointSignature, "NOT_BUILT", null);
        Map<String, Object> row = records.get(0);
        long revision = ((Number) row.get("revision")).longValue();
        if (!pointSignature.equals(row.get("point_signature"))) {
            return new TravelRouteStateVO(revision, pointSignature, "STALE", null);
        }
        try {
            TravelRouteWriteRequest.Route route = mapper.readValue(
                    String.valueOf(row.get("route_json")), TravelRouteWriteRequest.Route.class);
            return new TravelRouteStateVO(revision, pointSignature, "READY", route);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Route snapshot JSON is invalid", e);
        }
    }

    @Transactional
    public TravelRouteStateVO save(Long travelId, Long userId, TravelRouteWriteRequest request) {
        // Lock the parent travel row to serialize competing route snapshots.
        requireAccess(travelId, userId, true, true);
        List<Map<String, Object>> points = currentPoints(travelId);
        String currentSignature = signature(points);
        if (request == null || request.expectedRevision() == null || request.expectedRevision() < 0
                || request.pointSignature() == null || !currentSignature.equals(request.pointSignature())) {
            throw new BusinessException(409, "Travel points changed. Refresh the route before saving");
        }
        validate(travelId, points, request.route());
        List<Map<String, Object>> previous = jdbc.queryForList(
                "SELECT revision FROM travel_route_snapshot WHERE travel_id=? FOR UPDATE", travelId);
        long oldRevision = previous.isEmpty() ? 0 : ((Number) previous.get(0).get("revision")).longValue();
        if (request.expectedRevision() != oldRevision) {
            throw new BusinessException(409, "Route was updated elsewhere. Refresh before saving");
        }
        final String serialized;
        try { serialized = mapper.writeValueAsString(request.route()); }
        catch (JsonProcessingException e) { throw new BusinessException("Route could not be serialized"); }
        if (serialized.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_BYTES) {
            throw new BusinessException(413, "Route exceeds the 5 MB size limit");
        }
        long nextRevision = oldRevision + 1;
        if (previous.isEmpty()) {
            jdbc.update("INSERT INTO travel_route_snapshot " +
                            "(travel_id,revision,point_signature,route_json) VALUES (?,?,?,?)",
                    travelId, nextRevision, currentSignature, serialized);
        } else {
            int updated = jdbc.update("UPDATE travel_route_snapshot SET revision=?, point_signature=?, " +
                            "route_json=?, updated_at=CURRENT_TIMESTAMP(3) WHERE travel_id=? AND revision=?",
                    nextRevision, currentSignature, serialized, travelId, oldRevision);
            if (updated != 1) throw new BusinessException(409, "Route changed during save");
        }
        return new TravelRouteStateVO(nextRevision, currentSignature, "READY", request.route());
    }

    private void validate(long travelId, List<Map<String, Object>> points, TravelRouteWriteRequest.Route route) {
        if (route == null || route.travelId() == null || route.travelId() != travelId
                || !"GCJ-02".equals(route.coordinateSystem()) || !"AMAP_DRIVING".equals(route.source())
                || route.sourceSignature() == null || route.sourceSignature().length() > 24_000
                || route.geometry() == null || route.stopIds() == null || route.stopPointIndices() == null
                || points.size() < 2 || points.size() > MAX_POINTS || route.stopIds().size() != points.size()
                || route.stopPointIndices().size() != points.size() || route.geometry().size() < 2
                || route.geometry().size() > MAX_VERTICES || route.distanceMeters() == null
                || !Double.isFinite(route.distanceMeters()) || route.distanceMeters() <= 0) {
            throw new BusinessException("Invalid driving route");
        }
        int lastIndex = -1;
        for (int i = 0; i < points.size(); i++) {
            Long id = route.stopIds().get(i);
            Integer index = route.stopPointIndices().get(i);
            if (id == null || id.longValue() != ((Number) points.get(i).get("id")).longValue()
                    || index == null || index < 0 || index >= route.geometry().size() || index < lastIndex
                    || (i == 0 && index != 0) || (i == points.size() - 1 && index != route.geometry().size() - 1)) {
                throw new BusinessException("Route stops do not match current ordered travel points");
            }
            lastIndex = index;
        }
        for (TravelRouteWriteRequest.Point p : route.geometry()) {
            if (p == null || p.lng() == null || p.lat() == null
                    || !Double.isFinite(p.lng()) || !Double.isFinite(p.lat())
                    || Math.abs(p.lng()) > 180 || Math.abs(p.lat()) > 85) {
                throw new BusinessException("Route contains invalid coordinates");
            }
        }
        for (int i = 0; i < points.size(); i++) {
            Map<String, Object> point = points.get(i);
            TravelRouteWriteRequest.Point stop = route.geometry().get(route.stopPointIndices().get(i));
            double distance = meters(stop.lng(), stop.lat(),
                    ((Number) point.get("longitude")).doubleValue(),
                    ((Number) point.get("latitude")).doubleValue());
            if (distance > 500) throw new BusinessException("Route stop is more than 500 meters from the travel point");
        }
    }

    private static double meters(double lonA, double latA, double lonB, double latB) {
        double latDist = Math.toRadians(latB - latA);
        double lonDist = Math.toRadians(lonB - lonA);
        double v = Math.pow(Math.sin(latDist / 2), 2) +
                Math.cos(Math.toRadians(latA)) * Math.cos(Math.toRadians(latB)) *
                        Math.pow(Math.sin(lonDist / 2), 2);
        return 12742017.6 * Math.asin(Math.min(1, Math.sqrt(v)));
    }
}
