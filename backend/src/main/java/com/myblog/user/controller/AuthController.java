package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.LoginRequest;
import com.myblog.user.dto.RegisterRequest;
import com.myblog.user.service.AuthService;
import com.myblog.user.vo.LoginVO;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 用户认证 Controller。
 *
 * 对外提供：
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(
            AuthService authService) {

        this.authService =
                authService;
    }

    /**
     * 用户注册。
     */
    @PostMapping("/register")
    public ApiResult<Long> register(
            @RequestBody
            RegisterRequest request) {

        Long userId =
                authService.register(request);

        return ApiResult.success(
                "注册成功",
                userId
        );
    }

    /**
     * 用户登录。
     *
     * 登录成功以后，
     * data 中会比之前多一个：
     *
     * token
     */
    @PostMapping("/login")
    public ApiResult<LoginVO> login(
            @RequestBody
            LoginRequest request) {

        LoginVO loginVO =
                authService.login(request);

        return ApiResult.success(
                "登录成功",
                loginVO
        );
    }

    /**
     * 测试 JWT 是否生效。
     *
     * 这个接口被 AuthInterceptor 保护，
     * 所以必须携带：
     *
     * Authorization: Bearer <token>
     *
     * 才能访问。
     *
     * AuthInterceptor 验证通过以后，
     * 会把 userId、username 放到 request 中。
     */
    @GetMapping("/me")
    public ApiResult<Map<String, Object>> me(
            @RequestAttribute("userId")
            Long userId,

            @RequestAttribute("username")
            String username) {

        Map<String, Object> data =
                new LinkedHashMap<>();

        data.put(
                "userId",
                userId
        );

        data.put(
                "username",
                username
        );

        return ApiResult.success(
                "Token 验证成功",
                data
        );
    }
}
