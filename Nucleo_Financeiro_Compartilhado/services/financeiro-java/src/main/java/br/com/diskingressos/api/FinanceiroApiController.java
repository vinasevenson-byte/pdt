package br.com.diskingressos.api;

import br.com.diskingressos.shared.FirebaseRoleGuard;
import com.google.firebase.auth.FirebaseToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class FinanceiroApiController {

    private final FirebaseRoleGuard roleGuard;

    public FinanceiroApiController(FirebaseRoleGuard roleGuard) {
        this.roleGuard = roleGuard;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "service", "diskingressos-financeiro-java",
                "status", "UP",
                "modules", new String[]{"conciliacao", "fiscal", "remessa", "relatorios"}
        );
    }

    @GetMapping("/me")
    public Map<String, Object> whoami(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        FirebaseToken token = roleGuard.requireFinanceiroRole(authHeader);
        return Map.of(
                "uid", token.getUid(),
                "email", token.getEmail(),
                "role", "financeiro"
        );
    }
}
