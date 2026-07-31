import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  modalCardVariants,
  modalOverlayVariants,
  SPRING_MODAL,
} from "../../lib/animations/motion";

type Props = {
  open: boolean;
  onClose?: () => void;
  overlayClassName: string;
  cardClassName: string;
  closeOnOverlay?: boolean;
  children: React.ReactNode;
  role?: "dialog" | "alertdialog";
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export function AnimatedModal({
  open,
  onClose,
  overlayClassName,
  cardClassName,
  closeOnOverlay = true,
  children,
  role = "dialog",
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: Props) {
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={overlayClassName}
          role="presentation"
          variants={modalOverlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          onClick={closeOnOverlay && onClose ? onClose : undefined}
        >
          <motion.div
            className={cardClassName}
            role={role}
            aria-modal="true"
            aria-labelledby={ariaLabelledby}
            aria-describedby={ariaDescribedby}
            variants={modalCardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SPRING_MODAL}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
