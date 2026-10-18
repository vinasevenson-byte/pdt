package br.com.diskingressos.relatorios;

import br.com.diskingressos.shared.AuditoriaService;
import br.com.diskingressos.shared.MoneyUtils;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Serviço de Fechamento Mensal e Consolidação do Ledger (/lancamentos e /fechamentos) com BigDecimal.
 */
@Service
public class FechamentoMensalService {

    private final AuditoriaService auditoriaService;

    public FechamentoMensalService(AuditoriaService auditoriaService) {
        this.auditoriaService = auditoriaService;
    }

    public Map<String, Object> apurarTotaisCompetencia(String competencia, List<Long> debitosCents, List<Long> creditosCents) {
        long somaDebitos = debitosCents.stream().mapToLong(Long::longValue).sum();
        long somaCreditos = creditosCents.stream().mapToLong(Long::longValue).sum();
        boolean balanceado = somaDebitos == somaCreditos;

        BigDecimal totalDebitos = MoneyUtils.fromCents(somaDebitos);
        BigDecimal totalCreditos = MoneyUtils.fromCents(somaCreditos);

        return Map.of(
                "competencia", competencia,
                "totalDebitosCents", somaDebitos,
                "totalCreditosCents", somaCreditos,
                "totalDebitos", totalDebitos,
                "totalCreditos", totalCreditos,
                "partidaDobradaValida", balanceado
        );
    }
}
