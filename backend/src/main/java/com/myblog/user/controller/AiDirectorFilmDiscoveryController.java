package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.AiDirectorFilmDiscoveryService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Public feed, plus authenticated, owner-only listing controls. */
@RestController
public class AiDirectorFilmDiscoveryController {
    private final AiDirectorFilmDiscoveryService discovery;

    public AiDirectorFilmDiscoveryController(AiDirectorFilmDiscoveryService discovery) {
        this.discovery = discovery;
    }

    // Matches the v7 JWT exclusion /api/public/films/*; only already-listed films appear.
    @GetMapping("/api/public/films/discover")
    public ResponseEntity<ApiResult<AiDirectorFilmDiscoveryService.FilmPage>> feed(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "6") int size,
            @RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResult.success(discovery.discover(page, size, q)));
    }

    @GetMapping("/api/travels/{travelId}/ai-director/library/discovery")
    public ApiResult<List<String>> myListings(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long travelId) {
        return ApiResult.success(discovery.ownedListings(userId, travelId));
    }

    @PostMapping("/api/travels/{travelId}/ai-director/library/works/{workId}/discover")
    public ApiResult<AiDirectorFilmDiscoveryService.ListingState> include(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long travelId, @PathVariable String workId) {
        return ApiResult.success(discovery.listInDiscover(userId, travelId, workId));
    }

    @DeleteMapping("/api/travels/{travelId}/ai-director/library/works/{workId}/discover")
    public ApiResult<AiDirectorFilmDiscoveryService.ListingState> exclude(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long travelId, @PathVariable String workId) {
        return ApiResult.success(discovery.removeFromDiscover(userId, travelId, workId));
    }
}
