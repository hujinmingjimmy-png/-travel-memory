package com.myblog.user.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class FrontendController {

    @GetMapping({
            "/login",
            "/home",
            "/me",
            "/discover",
            "/social-hub",
            "/author/{id}",
            "/journey/{id}",
            "/journey/{id}/director",
            "/collab/journey/{id}",
            "/film/{token}"
    })
    public String frontend() {
        return "forward:/index.html";
    }
}
