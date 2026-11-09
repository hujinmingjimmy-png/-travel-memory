package com.myblog.user.interceptor;

import com.myblog.user.exception.BusinessException;
import com.myblog.user.util.JwtUtil;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

/**
 * JWT 登录拦截器。
 *
 * 用途：
 * 在请求真正进入 Controller 之前，
 * 检查请求是否携带有效 JWT。
 *
 * 前端以后会发送：
 *
 * Authorization: Bearer eyJhbGciOi...
 *
 * 如果 Token 正确：
 * 请求继续进入 Controller。
 *
 * 如果没有 Token / Token 错误 / Token 过期：
 * 阻止请求，并返回登录状态错误。
 */
@Component
public class AuthInterceptor implements org.springframework.web.servlet.HandlerInterceptor {

    private final JwtUtil jwtUtil;

    public AuthInterceptor(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    /**
     * Controller 执行前调用。
     */
    @Override
    public boolean preHandle(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler) {

        /*
         * 浏览器有时会发送 OPTIONS 预检请求。
         * 这类请求不进行 JWT 校验。
         */
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        /*
         * 从 HTTP Header 中读取：
         *
         * Authorization: Bearer xxxxx
         */
        String authorization =
                request.getHeader("Authorization");

        if (authorization == null
                || !authorization.startsWith("Bearer ")) {

            throw new BusinessException(
                    401,
                    "请先登录"
            );
        }

        /*
         * 去掉前面的：
         *
         * Bearer
         *
         * 得到真正 JWT。
         */
        String token =
                authorization.substring(7).trim();

        if (token.isEmpty()) {
            throw new BusinessException(
                    401,
                    "登录凭证不能为空"
            );
        }

        try {

            /*
             * 解析 Token。
             *
             * 如果被篡改或者已过期，
             * JwtUtil 会抛出异常。
             */
            Long userId =
                    jwtUtil.getUserId(token);

            String username =
                    jwtUtil.getUsername(token);

            /*
             * 把当前登录用户信息临时放进 request。
             *
             * 后面的 Controller 可以通过：
             *
             * @RequestAttribute("userId")
             *
             * 直接拿到当前用户 ID。
             *
             * 以后创建旅行时就靠这里，
             * 而不是相信前端自己传 userId。
             */
            request.setAttribute(
                    "userId",
                    userId
            );

            request.setAttribute(
                    "username",
                    username
            );

            return true;

        } catch (JwtException
                 | IllegalArgumentException exception) {

            throw new BusinessException(
                    401,
                    "登录凭证已失效，请重新登录"
            );
        }
    }
}
