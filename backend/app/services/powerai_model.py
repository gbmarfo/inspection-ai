"""Mock vision model artifact logged to MLflow."""

from __future__ import annotations

from typing import Any

import pandas as pd
from mlflow.pyfunc import PythonModel


class PowerAIVisionPyFunc(PythonModel):
    """Placeholder pyfunc model representing a trained vision detector."""

    def __init__(
        self,
        model_id: str = "",
        model_name: str = "",
        class_labels: list[str] | None = None,
    ) -> None:
        self.model_id = model_id
        self.model_name = model_name
        self.class_labels = class_labels or []

    def predict(self, context, model_input: pd.DataFrame, params=None) -> pd.DataFrame:
        rows = []
        for _index, row in model_input.iterrows():
            rows.append(
                {
                    "model_id": self.model_id,
                    "model_name": self.model_name,
                    "image_id": row.get("image_id", ""),
                    "detection_count": min(3, len(self.class_labels)),
                    "classes": ",".join(self.class_labels[:5]),
                }
            )
        return pd.DataFrame(rows)
