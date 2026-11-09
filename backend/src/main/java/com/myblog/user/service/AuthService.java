package com.myblog.user.service;

import com.myblog.user.dto.LoginRequest;
import com.myblog.user.dto.RegisterRequest;
import com.myblog.user.vo.LoginVO;

/**
 * 用户认证业务接口。
 */
public interface AuthService {

    /**
     * 注册用户。
     *
     * @return 新用户 ID
     */
    Long register(RegisterRequest request);

    /**
     * 登录用户。
     *
     * @return 用户基本信息 + JWT Token
     */
    LoginVO login(LoginRequest request);
}
