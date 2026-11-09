package com.myblog.user.config;

import com.myblog.user.service.SocialHubPush;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class SocialHubSocketConfig implements WebSocketConfigurer {
    private final SocialHubPush push;
    public SocialHubSocketConfig(SocialHubPush push){this.push=push;}
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Same-origin development; configure additional explicit origins for production.
        registry.addHandler(push,"/ws/social")
            .setAllowedOrigins("http://localhost:5173","http://127.0.0.1:5173");
    }
}
