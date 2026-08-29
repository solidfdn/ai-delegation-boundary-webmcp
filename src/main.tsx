import React from "react";
import ReactDOM from "react-dom/client";

import DelegationApp from "./DelegationApp";

ReactDOM
  .createRoot(
    document.getElementById("root")!
  )
  .render(
    <React.StrictMode>
      <DelegationApp />
    </React.StrictMode>
  );
