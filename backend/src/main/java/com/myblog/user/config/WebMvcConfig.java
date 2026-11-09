package com.myblog.user.config;

import com.myblog.user.interceptor.AuthInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 配置 JWT 登录拦截器。
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {
    private final AuthInterceptor authInterceptor;
    public WebMvcConfig(
            AuthInterceptor authInterceptor) {

        this.authInterceptor =
                authInterceptor;
    }

    /**
     * 配置哪些接口需要登录。
     */
    @Override
    public void addInterceptors(
            InterceptorRegistry registry) {

        registry
                .addInterceptor(authInterceptor)

                /*
                 * /api/**：
                 * 所有 API 默认都需要登录。
                 */
                .addPathPatterns("/api/**")

                /*
                 * 注册和登录必须允许未登录用户访问。
                 */
                .excludePathPatterns(
                        "/api/auth/login",
                        "/api/auth/register",
                        "/api/public/films/*",
                        "/api/public/films/*/video"
                );
    }
}
