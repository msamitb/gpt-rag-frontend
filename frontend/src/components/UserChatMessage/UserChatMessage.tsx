import styles from "./UserChatMessage.module.css";

interface Props {
    message: string;
    imageSrc?: string;
}

export const UserChatMessage = ({ message, imageSrc }: Props) => {
    return (
        <div className={styles.container}>
            <div className={styles.message}>
                <div>{message}</div>
                {imageSrc && (
                    <img
                        src={imageSrc}
                        alt="User attachment"
                        className={styles.image}
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                )}
            </div>
        </div>
    );
};
