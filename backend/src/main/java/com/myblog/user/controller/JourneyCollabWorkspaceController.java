package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.JourneyCollabWorkspaceService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/collab/travels/{travelId}/workspace")
public class JourneyCollabWorkspaceController {
    private final JourneyCollabWorkspaceService service;
    public JourneyCollabWorkspaceController(JourneyCollabWorkspaceService service) {this.service=service;}
    public record Story(String title,String body,String clientId) {}
    public record Policy(boolean enabled,boolean membersCanSubmit,boolean reviewRequired,long version) {}
    public record Review(boolean approve) {}
    public record ChatMessage(String body,String clientId) {}

    @GetMapping
    public ApiResult<Map<String,Object>> overview(@RequestAttribute("userId") long userId,@PathVariable long travelId) {
        return ApiResult.success(service.overview(userId,travelId));
    }
    @PutMapping("/policy")
    public ApiResult<Boolean> policy(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestBody Policy body) {
        service.savePolicy(userId,travelId,body.enabled(),body.membersCanSubmit(),body.reviewRequired(),body.version());return ApiResult.success(true);
    }
    @GetMapping("/posts")
    public ApiResult<List<Map<String,Object>>> posts(@RequestAttribute("userId") long userId,@PathVariable long travelId) {
        return ApiResult.success(service.contributions(userId,travelId));
    }
    @PostMapping("/stories")
    public ApiResult<Map<String,Object>> story(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestBody Story body) {
        return ApiResult.success(service.submission(userId,travelId,service.submitStory(userId,travelId,body.title(),body.body(),body.clientId())));
    }
    @PostMapping(value="/photos",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<Map<String,Object>> photo(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestParam("title") String title,@RequestParam("file") MultipartFile file,@RequestParam("clientId") String clientId) throws IOException {
        return ApiResult.success(service.submission(userId,travelId,service.submitPhoto(userId,travelId,title,file,clientId)));
    }
    public record AlbumPhoto(long mediaId,String title,String clientId) {}
    @PostMapping("/photos/from-album")
    public ApiResult<Map<String,Object>> fromAlbum(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestBody AlbumPhoto body) {
        return ApiResult.success(service.submission(userId,travelId,service.fromAlbum(userId,travelId,body.mediaId(),body.title(),body.clientId())));
    }
    @DeleteMapping("/posts/{postId}")
    public ApiResult<Boolean> remove(@RequestAttribute("userId") long userId,@PathVariable long travelId,@PathVariable long postId) {
        service.removePost(userId,travelId,postId);return ApiResult.success(true);
    }
    @GetMapping("/posts/{postId}/photo")
    public ResponseEntity<Resource> readPhoto(@RequestAttribute("userId") long userId,@PathVariable long travelId,@PathVariable long postId) {
        JourneyCollabWorkspaceService.Photo photo=service.photo(userId,travelId,postId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(photo.mime())).contentLength(photo.bytes())
            .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(photo.resource());
    }
    @PostMapping("/posts/{postId}/review")
    public ApiResult<Boolean> review(@RequestAttribute("userId") long userId,@PathVariable long travelId,@PathVariable long postId,@RequestBody Review body) {
        service.review(userId,travelId,postId,body.approve());return ApiResult.success(true);
    }
    @GetMapping("/chat")
    public ApiResult<List<Map<String,Object>>> chat(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestParam(defaultValue="0") long before) {
        return ApiResult.success(service.chat(userId,travelId,before));
    }
    @PostMapping("/chat")
    public ApiResult<Long> send(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestBody ChatMessage body) {
        return ApiResult.success(service.send(userId,travelId,body.body(),body.clientId()));
    }
    public record ReadPosition(long through) {}
    @PostMapping("/chat/read")
    public ApiResult<Boolean> read(@RequestAttribute("userId") long userId,@PathVariable long travelId,@RequestBody ReadPosition body) {
        service.readChat(userId,travelId,body.through());return ApiResult.success(true);
    }
}
