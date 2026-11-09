package com.myblog.user.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 工具类。
 *
 * 用途：
 * 1. 用户登录成功后生成 JWT Token。
 * 2. 收到前端请求时解析 JWT Token。
 * 3. 从 Token 中取出 userId、username。
 *
 * JWT 可以理解成：
 *
 * “服务器签发给登录用户的一张临时身份证”。
 *
 * 注意：
 * JWT 中不要保存密码等敏感信息。
 */
@Component
public class JwtUtil {

    /**
     * JWT 签名密钥。
     *
     * 从 application.yml 中读取：
     * jwt.secret
     *
     * 正式部署时应该通过环境变量设置，
     * 不要把正式服务器密钥直接提交到 Git。
     */
    @Value("${jwt.secret}")
    private String secret;

    /**
     * Token 有效时间，单位：毫秒。
     *
     * 当前开发阶段默认 7 天。
     */
    @Value("${jwt.expiration}")
    private Long expiration;

    /**
     * 根据配置中的字符串密钥生成 HMAC 签名密钥。
     */
    private SecretKey signingKey;

    @PostConstruct
    void initializeSigningKey() {
        signingKey = Keys.hmacShaKeyFor(
                secret.getBytes(StandardCharsets.UTF_8)
        );
    }

    /**
     * 生成登录 Token。
     *
     * @param userId   当前用户 ID
     * @param username 当前用户名
     * @return JWT 字符串
     */
    public String generateToken(Long userId, String username) {

        Date now = new Date();

        Date expireTime = new Date(
                now.getTime() + expiration
        );

        return Jwts.builder()

                // subject 用来保存用户 ID
                .subject(String.valueOf(userId))

                // 自定义字段：保存用户名
                .claim("username", username)

                // Token 签发时间
                .issuedAt(now)

                // Token 过期时间
                .expiration(expireTime)

                // 使用服务器密钥签名
                .signWith(signingKey)

                // 最终生成字符串
                .compact();
    }

    /**
     * 解析 JWT。
     *
     * 如果 Token：
     * - 被修改
     * - 已过期
     * - 签名不正确
     *
     * JJWT 会直接抛出异常。
     */
    public Claims parseToken(String token) {

        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * 从 JWT 中获取用户 ID。
     */
    public Long getUserId(String token) {

        Claims claims = parseToken(token);

        return Long.valueOf(
                claims.getSubject()
        );
    }

    /**
     * 从 JWT 中获取用户名。
     */
    public String getUsername(String token) {

        Claims claims = parseToken(token);

        return claims.get(
                "username",
                String.class
        );
    }
}
