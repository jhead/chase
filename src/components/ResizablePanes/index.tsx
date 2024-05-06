import styled from "@emotion/styled";
import React, { useContext, useEffect } from "react";
import { PropsWithChildren, ReactNode, useState } from "react";

type DragContext = {
  width: number;
  isDragging: boolean;
  startDrag: () => void;
};

const DragContext = React.createContext<DragContext>({
  width: 50,
  isDragging: false,
  startDrag: () => {},
});

export type ResizablePanesProps = {
  initialWidth: number;
};

export const ResizablePanes: React.FC<
  PropsWithChildren<ResizablePanesProps>
> = ({ children, initialWidth }) => {
  const [ctx, setContext] = useState<DragContext>({
    width: initialWidth,
    isDragging: false,
    startDrag: () => toggleDragState(true),
  });

  const toggleDragState = (isDragging: boolean) => {
    setContext((ctx) => ({ ...ctx, isDragging }));
  };

  const handleDragMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (ctx.isDragging) {
      const vw = (e.target as HTMLDivElement).clientWidth;
      const newWidth = (100 * Math.min(vw, e.clientX - 5)) / vw;
      setContext((ctx) => ({ ...ctx, width: newWidth }));
    }
  };

  return (
    <DragContext.Provider value={ctx}>
      <PaneContainer onMouseUp={() => toggleDragState(false)}>
        {ctx.isDragging ? <DragOverlay onMouseMove={handleDragMove} /> : null}
        {children}
      </PaneContainer>
    </DragContext.Provider>
  );
};

const LeftPane: React.FC<PropsWithChildren> = ({ children }) => {
  const { width, startDrag } = useContext(DragContext);

  const onDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    startDrag();
  };

  return (
    <>
      <div style={{ overflow: "scroll", width: `${width}%` }}>{children}</div>
      <PaneDivider onMouseDown={onDrag} />
    </>
  );
};

const RightPane = styled.div`
  flex-grow: 1;
  overflow: hidden;
`;

const PaneContainer = styled.div`
  display: flex;
  height: 100%;
  position: relative;
  flex: 1;
`;

const DragOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  // background-color: red;
  // opacity: 0.1;
  z-index: 1;
`;

const PaneDivider = styled.div`
  width: 5px;
  cursor: ew-resize;
  background-color: #666;

  &:hover {
    background-color: #888;
  }
`;

export namespace ResizablePane {
  export const Left = LeftPane;
  export const Right = RightPane;
}
