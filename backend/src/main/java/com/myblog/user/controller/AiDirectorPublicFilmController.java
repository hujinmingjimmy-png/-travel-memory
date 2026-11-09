package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.AiDirectorPublicShareService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Public metadata and video stream. Only published links are accessible without JWT. */
@RestController
@RequestMapping("/api/public/films")
public class AiDirectorPublicFilmController {
    private final AiDirectorPublicShareService shares;
    public AiDirectorPublicFilmController(AiDirectorPublicShareService shares) { this.shares = shares; }

    @GetMapping("/{token}")
    public ResponseEntity<ApiResult<AiDirectorPublicShareService.PublicFilm>> detail(@PathVariable String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Robots-Tag", "noindex, nofollow")
                .body(ApiResult.success(shares.publicFilm(token)));
    }

    @GetMapping("/{token}/video")
    public ResponseEntity<FileSystemResource> play(@PathVariable String token) throws Exception {
        var video = shares.publicVideo(token);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp4"))
                .header("Accept-Ranges", "bytes")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=travel-memory-film.mp4")
                .header("X-Content-Type-Options", "nosniff")
                .header("X-Robots-Tag", "noindex, nofollow")
                .cacheControl(CacheControl.noStore())
                .body(new FileSystemResource(video.file()));
    }
}
