package com.myblog.user.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.myblog.user.util.JwtUtil;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import java.util.concurrent.*;

/** Authenticated websocket only sends a generic refresh hint, never private data. */
@Component
public class SocialHubPush extends TextWebSocketHandler {
    private final JwtUtil jwt;
    private final ObjectMapper mapper;
    private final ConcurrentHashMap<WebSocketSession,Long> identities = new ConcurrentHashMap<>();
    public SocialHubPush(JwtUtil jwt, ObjectMapper mapper) { this.jwt=jwt; this.mapper=mapper; }
    @Override public void afterConnectionEstablished(WebSocketSession session) { /* first frame must authenticate */ }
    @Override protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        if (identities.containsKey(session)) return; // read-only signal channel
        try {
            JsonNode node = mapper.readTree(message.getPayload());
            if (!"AUTH".equals(node.path("type").asText()) || node.path("token").asText().isBlank()) {
                session.close(CloseStatus.POLICY_VIOLATION); return;
            }
            long user = jwt.getUserId(node.path("token").asText());
            identities.put(session,user);
            synchronized(session) { session.sendMessage(new TextMessage("{\"type\":\"READY\"}")); }
        } catch (Exception e) { session.close(CloseStatus.POLICY_VIOLATION); }
    }
    @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { identities.remove(session); }
    @Override public void handleTransportError(WebSocketSession session, Throwable e) throws Exception {
        identities.remove(session); if(session.isOpen())session.close();
    }
    public void hint(long userId) {
        Runnable task=()->{
            for(var row:identities.entrySet()) if(row.getValue()==userId && row.getKey().isOpen()) {
                try { synchronized(row.getKey()) { row.getKey().sendMessage(new TextMessage("{\"type\":\"SYNC\"}")); } }
                catch(Exception ignored) { identities.remove(row.getKey()); }
            }
        };
        if(TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit(){task.run();}
            });
        } else task.run();
    }
}
