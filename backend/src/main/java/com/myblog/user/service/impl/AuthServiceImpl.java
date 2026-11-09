package com.myblog.user.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.myblog.user.dto.LoginRequest;
import com.myblog.user.dto.RegisterRequest;
import com.myblog.user.entity.User;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.mapper.UserMapper;
import com.myblog.user.service.AuthService;
import com.myblog.user.util.JwtUtil;
import com.myblog.user.vo.LoginVO;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

/**
 * 用户认证业务实现类。
 *
 * 当前负责：
 * 1. 注册
 * 2. 登录
 * 3. BCrypt 密码处理
 * 4. 登录成功后签发 JWT
 */
@Service
public class AuthServiceImpl
        implements AuthService {

    /**
     * 操作 user 表。
     */
    private final UserMapper userMapper;

    /**
     * BCrypt 密码工具。
     */
    private final PasswordEncoder passwordEncoder;

    /**
     * JWT 工具。
     */
    private final JwtUtil jwtUtil;

    /**
     * 构造方法注入。
     */
    public AuthServiceImpl(
            UserMapper userMapper,
            PasswordEncoder passwordEncoder,
            JwtUtil jwtUtil) {

        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    /**
     * 用户注册。
     */
    @Override
    public Long register(
            RegisterRequest request) {

        /*
         * ================================
         * 1. 检查参数
         * ================================
         */

        if (request == null) {
            throw new BusinessException(
                    "注册信息不能为空"
            );
        }

        if (request.getUsername() == null
                || request.getUsername()
                .trim()
                .isEmpty()) {

            throw new BusinessException(
                    "用户名不能为空"
            );
        }

        if (request.getPassword() == null
                || request.getPassword()
                .isEmpty()) {

            throw new BusinessException(
                    "密码不能为空"
            );
        }

        String username =
                request.getUsername().trim();

        /*
         * 健康检查：
         * 与数据库 VARCHAR(50) 保持一致，
         * 避免超长输入最后变成数据库 500。
         */
        if (username.length() < 3
                || username.length() > 50) {
            throw new BusinessException(
                    "用户名长度必须为3～50个字符"
            );
        }

        String rawPassword =
                request.getPassword();

        if (rawPassword.length() < 6) {
            throw new BusinessException(
                    "密码至少需要6个字符"
            );
        }

        /*
         * BCrypt 最多可靠处理 72 字节。
         * 这里按 UTF-8 字节数限制，避免长密码被静默截断。
         */
        if (rawPassword
                .getBytes(StandardCharsets.UTF_8)
                .length > 72) {
            throw new BusinessException(
                    "密码过长，请控制在72个UTF-8字节以内"
            );
        }

        String nickname =
                request.getNickname() == null
                        ? null
                        : request.getNickname().trim();

        if (nickname != null
                && nickname.length() > 50) {
            throw new BusinessException(
                    "昵称不能超过50个字符"
            );
        }

        /*
         * ================================
         * 2. 判断用户名是否重复
         * ================================
         */

        Long count =
                userMapper.selectCount(
                        new LambdaQueryWrapper<User>()
                                .eq(
                                        User::getUsername,
                                        username
                                )
                );

        if (count > 0) {
            throw new BusinessException(
                    "用户名已经存在"
            );
        }

        /*
         * ================================
         * 3. 创建用户
         * ================================
         */

        User user = new User();

        user.setUsername(username);

        /*
         * BCrypt 加密密码。
         *
         * 数据库不会保存明文 123456。
         */
        user.setPassword(
                passwordEncoder.encode(
                        request.getPassword()
                )
        );

        /*
         * 没有昵称时，
         * 暂时使用用户名作为昵称。
         */
        if (nickname == null
                || nickname.isEmpty()) {

            user.setNickname(username);

        } else {

            user.setNickname(nickname);
        }

        /*
         * 1 = 正常用户。
         */
        user.setStatus(1);

        /*
         * ================================
         * 4. 写入 MySQL
         * ================================
         */
        userMapper.insert(user);

        /*
         * MyBatis-Plus 会把数据库生成的
         * 自增 ID 回填到 user.id。
         */
        return user.getId();
    }

    /**
     * 用户登录。
     */
    @Override
    public LoginVO login(
            LoginRequest request) {

        /*
         * ================================
         * 1. 检查登录参数
         * ================================
         */

        if (request == null) {
            throw new BusinessException(
                    "登录信息不能为空"
            );
        }

        if (request.getUsername() == null
                || request.getUsername()
                .trim()
                .isEmpty()) {

            throw new BusinessException(
                    "用户名不能为空"
            );
        }

        if (request.getPassword() == null
                || request.getPassword()
                .isEmpty()) {

            throw new BusinessException(
                    "密码不能为空"
            );
        }

        String username =
                request.getUsername().trim();

        /*
         * ================================
         * 2. 查询用户
         * ================================
         */

        User user =
                userMapper.selectOne(
                        new LambdaQueryWrapper<User>()
                                .eq(
                                        User::getUsername,
                                        username
                                )
                );

        /*
         * 用户不存在时，
         * 不明确告诉前端“用户名不存在”，
         * 避免泄露账号信息。
         */
        if (user == null) {
            throw new BusinessException(
                    "用户名或密码错误"
            );
        }

        /*
         * ================================
         * 3. 检查账号状态
         * ================================
         */

        if (user.getStatus() != null
                && user.getStatus() == 0) {

            throw new BusinessException(
                    "该账号已被禁用"
            );
        }

        /*
         * ================================
         * 4. BCrypt 验证密码
         * ================================
         */

        boolean passwordCorrect =
                passwordEncoder.matches(
                        request.getPassword(),
                        user.getPassword()
                );

        if (!passwordCorrect) {
            throw new BusinessException(
                    "用户名或密码错误"
            );
        }

        /*
         * ================================
         * 5. 登录成功，生成 JWT
         * ================================
         */

        String token =
                jwtUtil.generateToken(
                        user.getId(),
                        user.getUsername()
                );

        /*
         * ================================
         * 6. 组装返回数据
         * ================================
         */

        LoginVO loginVO =
                new LoginVO();

        loginVO.setId(
                user.getId()
        );

        loginVO.setUsername(
                user.getUsername()
        );

        loginVO.setNickname(
                user.getNickname()
        );

        loginVO.setAvatar(
                user.getAvatar()
        );

        loginVO.setToken(token);

        return loginVO;
    }
}
