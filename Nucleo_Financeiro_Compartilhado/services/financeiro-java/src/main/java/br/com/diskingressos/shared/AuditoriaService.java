package br.com.diskingressos.shared;

import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import org.springframework.stereotype.Service;

import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Helper compartilhado para gravar obrigatoriamente em `/auditoria` no Firebase RTDB.
 * Nota arquitetural: o serviço Java NUNCA escreve diretamente nos nós que disparam triggers Node
 * (`/eventos`, `/eventos_fin`, `/negociacoes`, `/despesas`, `/advanced`, `/antecipacoes`) para evitar loops.
 */
@Service
public class AuditoriaService {

    private static final DateTimeFormatter BR_FMT =
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss").withZone(ZoneId.of("America/Sao_Paulo"));

    public Map<String, Object> registrar(String usuario, String modulo, String eventoId, String acao, String resumo) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("dataHora", BR_FMT.format(ZonedDateTime.now()));
        entry.put("usuario", usuario != null ? usuario : "sistema-java");
        entry.put("modulo", modulo);
        entry.put("eventoId", eventoId != null ? eventoId : "");
        entry.put("acao", acao);
        entry.put("resumo", resumo);

        DatabaseReference ref = FirebaseDatabase.getInstance().getReference("/auditoria").push();
        ref.setValueAsync(entry);
        return entry;
    }
}
