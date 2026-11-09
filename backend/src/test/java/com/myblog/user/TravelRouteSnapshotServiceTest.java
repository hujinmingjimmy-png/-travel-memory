package com.myblog.user;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.myblog.user.dto.TravelRouteWriteRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.service.TravelRouteSnapshotService;
import com.myblog.user.vo.TravelRouteStateVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TravelRouteSnapshotServiceTest {
    private JdbcTemplate jdbc;
    private TravelRouteSnapshotService service;

    @BeforeEach
    void init() {
        jdbc = mock(JdbcTemplate.class);
        service = new TravelRouteSnapshotService(jdbc, new ObjectMapper());
    }

    private void project(long owner, String visibility, int published, boolean lock) {
        when(jdbc.queryForList(
                "SELECT user_id, visibility, is_published FROM travel_project WHERE id=?" +
                        (lock ? " FOR UPDATE" : ""), 5L))
                .thenReturn(List.of(Map.of("user_id", owner, "visibility", visibility,
                        "is_published", published)));
    }

    private void points() {
        when(jdbc.queryForList(
                "SELECT id, sort_order, longitude, latitude FROM travel_point " +
                        "WHERE travel_id=? AND point_type='REAL' ORDER BY sort_order, id LIMIT 121", 5L))
                .thenReturn(List.of(
                        Map.of("id", 11L, "sort_order", 0, "longitude", 120.1, "latitude", 31.1),
                        Map.of("id", 12L, "sort_order", 1, "longitude", 120.2, "latitude", 31.2)));
    }

    @Test
    void privateTravelCannotLeakRoute() {
        project(7L, "PRIVATE", 1, false);
        assertEquals(404, assertThrows(BusinessException.class,
                () -> service.read(5L, 8L)).getCode());
        verify(jdbc, never()).queryForList(startsWith("SELECT revision"), anyLong());
    }

    @Test
    void readableProjectWithoutSnapshotReturnsSignature() {
        project(7L, "PUBLIC", 1, false);
        points();
        when(jdbc.queryForList(
                "SELECT revision, point_signature, route_json FROM travel_route_snapshot WHERE travel_id=?", 5L))
                .thenReturn(List.of());
        TravelRouteStateVO state = service.read(5L, 8L);
        assertEquals("NOT_BUILT", state.cacheState());
        assertEquals(0L, state.revision());
        assertEquals(64, state.pointSignature().length());
        assertNull(state.route());
    }

    @Test
    void staleSavedSnapshotNeverReturnsOldGeometry() {
        project(7L, "PUBLIC", 1, false);
        points();
        when(jdbc.queryForList(
                "SELECT revision, point_signature, route_json FROM travel_route_snapshot WHERE travel_id=?", 5L))
                .thenReturn(List.of(Map.of("revision", 3L, "point_signature", "outdated", "route_json", "{}")));
        TravelRouteStateVO state = service.read(5L, 8L);
        assertEquals("STALE", state.cacheState());
        assertEquals(3L, state.revision());
        assertNull(state.route());
    }

    @Test
    void visitorCannotSave() {
        project(7L, "PUBLIC", 1, true);
        assertEquals(403, assertThrows(BusinessException.class,
                () -> service.save(5L, 8L, null)).getCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void stalePointSignatureRejectsWrites() {
        project(7L, "PRIVATE", 0, true);
        points();
        var request = new TravelRouteWriteRequest(0L, "old-points", null);
        assertEquals(409, assertThrows(BusinessException.class,
                () -> service.save(5L, 7L, request)).getCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void rejectsStopsFromAnotherTravel() {
        project(7L, "PRIVATE", 0, false);
        project(7L, "PRIVATE", 0, true);
        points();
        when(jdbc.queryForList(
                "SELECT revision, point_signature, route_json FROM travel_route_snapshot WHERE travel_id=?", 5L))
                .thenReturn(List.of());
        String sig = service.read(5L, 7L).pointSignature();
        var route = new TravelRouteWriteRequest.Route(5L, "GCJ-02", "AMAP_DRIVING", "src",
                List.of(new TravelRouteWriteRequest.Point(120.1, 31.1),
                        new TravelRouteWriteRequest.Point(120.2, 31.2)),
                List.of(11L, 99L), List.of(0, 1), 20000.0);
        var request = new TravelRouteWriteRequest(0L, sig, route);
        assertEquals(400, assertThrows(BusinessException.class,
                () -> service.save(5L, 7L, request)).getCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}
