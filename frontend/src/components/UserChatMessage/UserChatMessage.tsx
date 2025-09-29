import styles from "./UserChatMessage.module.css";
import React from "react";

interface Props {
    message: string;
    imageUrl?: string | null;
}

export const UserChatMessage: React.FC<Props> = ({ message, imageUrl }) => {
    return (
        <div className={styles.container}>
            <div className={styles.message}>
                <div>{message}</div>
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt="user attachment"
                        className={styles.imageAttachment}
                    />
                )}
            </div>
        </div>
    );
};
