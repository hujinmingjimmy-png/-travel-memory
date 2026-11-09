package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.SocialChatPlusService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;

/** v13 chat extensions: all /api/** endpoints require the existing JWT interceptor. */
@RestController
@RequestMapping("/api/social-hub/conversations/{other}")
public class SocialChatPlusController {
    private final SocialChatPlusService s;
    public SocialChatPlusController(SocialChatPlusService s){this.s=s;}

    public record ReplyRequest(String body,String clientId,Long replyToId) {}

    @PostMapping("/replies")
    public ApiResult<?> reply(@RequestAttribute("userId") long me,@PathVariable long other,
            @RequestBody ReplyRequest request) {
        return ApiResult.success(s.sendReply(me,other,request.body(),request.clientId(),request.replyToId()));
    }

    @PostMapping(value="/images",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<?> imageUpload(@RequestAttribute("userId") long me,@PathVariable long other,
            @RequestParam("file") MultipartFile file,@RequestParam("clientId") String clientId) throws IOException {
        return ApiResult.success(s.upload(me,other,file,clientId));
    }

    @GetMapping("/images/{messageId}")
    public ResponseEntity<byte[]> imageRead(@RequestAttribute("userId") long me,@PathVariable long other,
            @PathVariable long messageId) throws IOException {
        var img=s.image(me,other,messageId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options","nosniff")
                .contentType(MediaType.parseMediaType(img.mime())).body(img.bytes());
    }

    @PostMapping("/messages/{messageId}/recall")
    public ApiResult<?> recall(@RequestAttribute("userId") long me,@PathVariable long other,@PathVariable long messageId){
        s.recall(me,other,messageId);return ApiResult.success(true);
    }

    @GetMapping("/search")
    public ApiResult<?> search(@RequestAttribute("userId") long me,@PathVariable long other,@RequestParam String q){
        return ApiResult.success(s.search(me,other,q));
    }
}
