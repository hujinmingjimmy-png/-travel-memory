package com.myblog.user.vo;

import com.myblog.user.dto.TravelRouteWriteRequest;

/** Server-generated point signature is independent of client-provided route metadata. */
public record TravelRouteStateVO(
        long revision,
        String pointSignature,
        String cacheState,
        TravelRouteWriteRequest.Route route) {}
