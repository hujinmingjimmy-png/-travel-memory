package com.myblog.user.dto;

import java.util.List;

/**
 * An AMap driving route. Coordinates remain GCJ-02 on the wire and in storage.
 * Java records deliberately avoid Lombok annotation-processing dependencies.
 */
public record TravelRouteWriteRequest(
        Long expectedRevision,
        String pointSignature,
        Route route) {
    public record Point(Double lng, Double lat) {}

    public record Route(
            Long travelId,
            String coordinateSystem,
            String source,
            String sourceSignature,
            List<Point> geometry,
            List<Long> stopIds,
            List<Integer> stopPointIndices,
            Double distanceMeters) {}
}
