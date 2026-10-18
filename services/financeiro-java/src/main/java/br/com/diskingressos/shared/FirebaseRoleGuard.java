package br.com.diskingressos.shared;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Valida o Firebase ID Token (Bearer) e garante que a custom claim `role` seja estritamente `financeiro`.
 */
@Component
public class FirebaseRoleGuard {

    public FirebaseToken requireFinanceiroRole(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token Bearer do Firebase ausente.");
        }
        String idToken = authorizationHeader.substring("Bearer ".length()).trim();
        try {
            FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(idToken);
            Map<String, Object> claims = decoded.getClaims();
            Object role = claims != null ? claims.get("role") : null;
            if (!"financeiro".equals(role)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acesso restrito ao perfil Financeiro.");
            }
            return decoded;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "ID Token do Firebase inválido ou expirado.", e);
        }
    }
}
