package br.com.diskingressos.shared;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Utilitário monetário exato em BigDecimal e centavos inteiros (long) para o serviço Java.
 */
public final class MoneyUtils {

    private MoneyUtils() {
    }

    public static long toCents(BigDecimal valorReais) {
        if (valorReais == null) return 0L;
        return valorReais.setScale(2, RoundingMode.HALF_UP)
                .movePointRight(2)
                .longValueExact();
    }

    public static BigDecimal fromCents(long valorCents) {
        return BigDecimal.valueOf(valorCents, 2);
    }
}
