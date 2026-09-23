import React from "react";
import type { Config } from "@puckeditor/core";
import { DropZone } from "@puckeditor/core";
import { COMPONENT_REGISTRY } from "./registry";
import { BlockRenderer, getColumnsLayoutInfo } from "@/components/admin/composer/BlockRenderer";
import { ContentBlock } from "@/lib/domain/pages";

export const puckConfig: Config = {
  components: {}
};

Object.keys(COMPONENT_REGISTRY).forEach((type) => {
  const def = COMPONENT_REGISTRY[type];

  const puckFields: Record<string, any> = {};
  if (def.fields) {
    Object.keys(def.fields).forEach((key) => {
      const fieldDef = def.fields![key];
      if (fieldDef.type === "text") puckFields[key] = { type: "text" };
      else if (fieldDef.type === "textarea") puckFields[key] = { type: "textarea" };
      else if (fieldDef.type === "select") {
        puckFields[key] = {
          type: "select",
          options: fieldDef.options?.map((o) => ({ label: o.label, value: o.value })) || []
        };
      } else if (fieldDef.type === "radio") {
        puckFields[key] = {
          type: "radio",
          options: fieldDef.options?.map((o) => ({ label: o.label, value: o.value })) || []
        };
      }
    });
  }

  puckConfig.components[type] = {
    fields: puckFields,
    defaultProps: def.createDefaultData(),
    render: (props: any) => {
      // Special handling for columns block which supports nesting via DropZone in Puck editor
      if (type === "columns") {
        const { gapClass, gridClass } = getColumnsLayoutInfo(props.layout, props.gap);
        return (
          <div className={`grid ${gridClass} ${gapClass} w-full my-2`}>
            <div className="col-span-full">
              <DropZone zone="default" />
            </div>
          </div>
        );
      }

      const block: ContentBlock = {
        id: props.id || "preview",
        type: type as any,
        order: 0,
        data: props
      };

      return <BlockRenderer block={block} isPreview={true} />;
    }
  };
});
